import os
import time
import uuid
import asyncio
from typing import Dict, Optional, Any, List
from pathlib import Path

from core.services.content.pipeline_service import PipelineService
from core.infrastructure.database.db_connection import DatabaseConnection, ConnectionConfig
from core.infrastructure.database.schema import SchemaManager
from core.utils.logger import get_logger
from core.utils.config import load_config
from core.infrastructure.auth.config import get_auth_provider_config
from core.llm.providers.anthropic.anthropic_provider import AnthropicProvider
from core.llm.providers.base.provider import ProviderType 
from core.llm.providers.base.provider_base import BaseLLMProvider
from core.llm.factory.factory import LLMProviderFactory
from core.llm.providers.config.config_manager import ProviderConfigManager
from core.domain.content.pipeline import (
    DefaultStateManager,
    DefaultComponentCoordinator,
    DefaultEventSystem,
    PipelineConfig
)


class AppState:
    """Container for application state."""
    def __init__(self):
        self.pipeline_service: Optional[PipelineService] = None
        self.db_connection: Optional[DatabaseConnection] = None
        self.schema_manager: Optional[SchemaManager] = None
        self.logger = get_logger(__name__)
        self._auth_config = None
        self.llm_factory: Optional[LLMProviderFactory] = None
        self.llm_providers: Dict[str, BaseLLMProvider] = {}
        self.agent_tasks: Dict[str, Dict[str, Any]] = {}
        self._health_check_task: Optional[asyncio.Task] = None
        self._shutdown_requested: bool = False
        

    async def initialize(self) -> None:
        """Initialize application services with enhanced error handling and monitoring."""
        try:
            # Initialize database connection
            config = load_config()
            config_dir = config.get("config_dir", "./config")
            config_path = Path(config_dir)

            # Log configuration details
            self.logger.info(f"Initializing with config from {config_dir}")
            self.logger.debug(f"Neo4j URI: {config['neo4j_uri']}")
            
            # Initialize database connection with better error logging
            db_config = ConnectionConfig(
                uri=config["neo4j_uri"],
                username=config["neo4j_username"],
                password=config["neo4j_password"],
                max_connection_pool_size=int(config.get("max_connection_pool_size", 50)),
                connection_timeout=int(config.get("connection_timeout", 30))
            )
            self.logger.info(f"Creating database connection (pool size: {db_config.max_connection_pool_size})")
            self.db_connection = DatabaseConnection(db_config)
            await self.db_connection.initialize()
            
            # Verify database connection with a quick health check
            try:
                pool_status = await self.db_connection.check_connection_pool()
                self.logger.info(f"Initial database connection pool status: {pool_status}")
            except Exception as pool_error:
                self.logger.warning(f"Could not check connection pool: {str(pool_error)}")

            # Initialize schema manager
            self.logger.info("Initializing schema manager")
            self.schema_manager = SchemaManager(self.db_connection)
            await self.schema_manager.initialize()

            # Create pipeline config
            pipeline_config = PipelineConfig(
                max_concurrent_pages=int(config.get("max_concurrent_pages", 10)),
                event_logging_enabled=True
            )

            # Initialize Auth Config
            self.logger.info("Initializing auth provider configuration")
            self.auth_config = get_auth_provider_config(config.get("config_dir", "./config"))

            # Initialize LLM provider factory
            self.logger.info("Initializing LLM provider factory")
            provider_config_manager = ProviderConfigManager(config_path)
            self.llm_factory = LLMProviderFactory(provider_config_manager)

            # Register LLM providers with factory
            self.logger.info("Registering Anthropic provider")
            self.llm_factory.register_provider(ProviderType.ANTHROPIC, AnthropicProvider)
            
            # Create pipeline dependencies
            self.logger.info("Creating pipeline components")
            state_manager = DefaultStateManager(config=pipeline_config)
            component_coordinator = DefaultComponentCoordinator(config=pipeline_config)
            event_system = DefaultEventSystem(config=pipeline_config)
            

            # Initialize pipeline service
            self.logger.info("Initializing pipeline service")
            self.pipeline_service = PipelineService(
                state_manager=state_manager,
                component_coordinator=component_coordinator,
                event_system=event_system,
                config=pipeline_config,
                db_connection=self.db_connection
            )
            await self.pipeline_service.initialize()
            
            # Initialize auth config
            self.logger.info("Initializing auth provider configuration")
            await self.initialize_auth_config()
            
            # Start health check task if enabled
            if config.get("enable_health_checks", True):
                self.logger.info("Starting periodic health checks")
                await self.start_health_checks()

            # Start agent task cleanup
            self.logger.info("Starting periodic agent task cleanup")
            asyncio.create_task(self._run_agent_task_cleanup())

            
            self.logger.info("Application state initialized successfully")
        except Exception as e:
            self.logger.error(f"Failed to initialize application state: {str(e)}", exc_info=True)
            # Clean up any partially initialized resources
            await self.cleanup()
            raise


    async def cleanup(self) -> None:
        """Cleanup application services with enhanced error handling."""
        self.logger.info("Beginning application cleanup")
        self._shutdown_requested = True
        
        # Cancel health check task first
        if self._health_check_task:
            self.logger.debug("Cancelling health check task")
            self._health_check_task.cancel()
            try:
                await self._health_check_task
            except asyncio.CancelledError:
                self.logger.debug("Health check task cancelled")
            except Exception as e:
                self.logger.warning(f"Error while cancelling health check task: {str(e)}")
        
        # Clean up services with better error handling
        cleanup_errors = []
        
        # Clean up pipeline service
        if self.pipeline_service:
            try:
                self.logger.debug("Cleaning up pipeline service")
                await self.pipeline_service.cleanup()
                self.logger.debug("Pipeline service cleanup complete")
            except Exception as e:
                error_msg = f"Error cleaning up pipeline service: {str(e)}"
                self.logger.error(error_msg)
                cleanup_errors.append(error_msg)
        
        # Clean up LLM providers
        if self.llm_factory:
            try:
                self.logger.debug("Shutting down LLM providers")
                await self.llm_factory.shutdown_all()
                self.logger.debug("LLM providers shutdown complete")
            except Exception as e:
                error_msg = f"Error shutting down LLM providers: {str(e)}"
                self.logger.error(error_msg)
                cleanup_errors.append(error_msg)

        if self.agent_tasks:
            try:
                self.logger.debug("Cleaning up agent tasks")
                await self.cleanup_agent_tasks(max_age_hours=1)  # Clean up tasks older than 1 hour on shutdown
                self.logger.debug("Agent tasks cleanup complete")
            except Exception as e:
                error_msg = f"Error cleaning up agent tasks: {str(e)}"
                self.logger.error(error_msg)
                cleanup_errors.append(error_msg)
        
        # Clean up database connection last
        if self.db_connection:
            try:
                # Check connection pool status before shutdown for debugging
                try:
                    pool_status = await self.db_connection.check_connection_pool()
                    self.logger.info(f"Connection pool status before shutdown: {pool_status}")
                except Exception as pool_error:
                    self.logger.warning(f"Error checking connection pool before shutdown: {str(pool_error)}")
                
                self.logger.debug("Shutting down database connection")
                await self.db_connection.shutdown()
                self.logger.debug("Database connection shutdown complete")
            except Exception as e:
                error_msg = f"Error shutting down database connection: {str(e)}"
                self.logger.error(error_msg)
                cleanup_errors.append(error_msg)

        # Clean up task managers
        if hasattr(self, "_registered_task_managers"):
            for task_manager in self._registered_task_managers:
                try:
                    self.logger.debug(f"Shutting down task manager for {task_manager.component_name}")
                    await task_manager.shutdown()
                except Exception as e:
                    error_msg = f"Error shutting down task manager: {str(e)}"
                    self.logger.error(error_msg)
                    cleanup_errors.append(error_msg)
        
        # Report any cleanup errors
        if cleanup_errors:
            self.logger.warning(f"Cleanup completed with {len(cleanup_errors)} errors")
        else:
            self.logger.info("Application cleanup completed successfully")

    # Property for config_dir
    @property
    def config_dir(self) -> str:
        """Get the configuration directory."""
        return os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "config")

    # Property for auth_config
    @property
    def auth_config(self) -> Any:
        """Get the auth provider configuration."""
        return self._auth_config
    
    @auth_config.setter
    def auth_config(self, value: Any) -> None:
        self._auth_config = value

    # Method to initialize auth config
    async def initialize_auth_config(self) -> None:
        """Initialize the auth provider configuration with better error handling."""
        try:
            config_dir = os.path.join(self.config_dir, "auth")
            os.makedirs(config_dir, exist_ok=True)  # Ensure directory exists
            self._auth_config = get_auth_provider_config(config_dir)
            
            # Ensure we can get the local provider
            self._auth_config.get_provider("local")
            self.logger.info("Auth provider configuration initialized")
        except Exception as e:
            self.logger.error(f"Failed to initialize auth provider configuration: {str(e)}")
            if "Master key not found" in str(e):
                self.logger.error(
                    "Please set SECRET_KEY environment variable for secure credential storage"
                )
            # Still raise to prevent partial initialization
            raise

    
    async def start_health_checks(self, interval: int = 30) -> None:
        """Start periodic health checks."""
        if self._health_check_task is not None:
            self.logger.warning("Health check task already running")
            return
            
        self._health_check_task = asyncio.create_task(
            self._run_health_checks(interval)
        )
        self.logger.info(f"Health check task started (interval: {interval}s)")
        
    async def _run_health_checks(self, interval: int) -> None:
        """Run periodic health checks to monitor system status."""
        try:
            while not self._shutdown_requested:
                try:
                    # Database connection pool status
                    if self.db_connection:
                        try:
                            pool_status = await self.db_connection.check_connection_pool()
                            
                            # Log based on status
                            if pool_status.get("status") == "at_capacity":
                                self.logger.warning(f"Neo4j connection pool at capacity: {pool_status}")
                            elif pool_status.get("in_use", 0) > (pool_status.get("max_size", 100) * 0.8):
                                self.logger.warning(f"Neo4j connection pool approaching capacity: {pool_status}")
                            else:
                                self.logger.debug(f"Neo4j connection pool status: {pool_status}")
                        except Exception as e:
                            self.logger.warning(f"Error checking Neo4j connection pool: {str(e)}")
                    
                    # Pipeline service health
                    if self.pipeline_service:
                        queue_size = getattr(self.pipeline_service, "get_queue_size", lambda: None)()
                        if queue_size is not None and queue_size > 10:
                            self.logger.warning(f"Pipeline queue size is high: {queue_size}")
                    
                    # Wait for next check interval
                    await asyncio.sleep(interval)
                    
                except asyncio.CancelledError:
                    raise
                except Exception as e:
                    self.logger.error(f"Error during health check iteration: {str(e)}")
                    await asyncio.sleep(interval)  # Continue with next iteration after error
                    
        except asyncio.CancelledError:
            self.logger.info("Health check task cancelled")
        except Exception as e:
            self.logger.error(f"Health check task failed: {str(e)}")


    # Agent state management
    async def create_agent_task(self, task_type: str, query: str, relevant_urls: Optional[List[str]] = None) -> str:
        """Create a new agent task and return its ID."""
        task_id = str(uuid.uuid4())
        
        self.agent_tasks[task_id] = {
            "id": task_id,
            "type": task_type,
            "query": query,
            "status": "enqueued",
            "created_at": time.time(),
            "relevant_urls": relevant_urls or [],
            "result": None,
            "error": None
        }
        
        self.logger.info(f"Created agent task {task_id} for query: {query}")
        return task_id

    async def get_agent_task(self, task_id: str) -> Optional[Dict[str, Any]]:
        """Get an agent task by ID."""
        return self.agent_tasks.get(task_id)

    async def update_agent_task(self, task_id: str, updates: Dict[str, Any]) -> None:
        """Update an agent task."""
        if task_id in self.agent_tasks:
            self.agent_tasks[task_id].update(updates)
            self.logger.debug(f"Updated agent task {task_id}: {updates.keys()}")
        else:
            self.logger.warning(f"Attempted to update non-existent agent task: {task_id}")

    async def cleanup_agent_tasks(self, max_age_hours: int = 24) -> None:
        """Clean up old agent tasks."""
        now = time.time()
        max_age_seconds = max_age_hours * 60 * 60
        
        to_remove = []
        for task_id, task in self.agent_tasks.items():
            # Remove tasks older than max_age
            if now - task["created_at"] > max_age_seconds:
                to_remove.append(task_id)
        
        for task_id in to_remove:
            self.agent_tasks.pop(task_id, None)
            
        if to_remove:
            self.logger.info(f"Cleaned up {len(to_remove)} old agent tasks")

    async def _run_agent_task_cleanup(self, interval: int = 3600):
        """Periodically clean up old agent tasks."""
        try:
            while not self._shutdown_requested:
                await asyncio.sleep(interval)  # Run every hour by default
                
                if not self._shutdown_requested:  # Check again after sleeping
                    await self.cleanup_agent_tasks()
                    
        except asyncio.CancelledError:
            self.logger.debug("Agent task cleanup task cancelled")
        except Exception as e:
            self.logger.error(f"Error in agent task cleanup: {str(e)}")

app_state = AppState()

def get_app_state() -> AppState:
    """Dependency to get the global app state."""
    return app_state