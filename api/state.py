import os
from core.services.content.pipeline_service import PipelineService
from core.infrastructure.database.db_connection import DatabaseConnection, ConnectionConfig
from core.infrastructure.database.schema import SchemaManager
from core.utils.logger import get_logger
from core.utils.config import load_config
from core.infrastructure.auth.config import get_auth_provider_config
from core.domain.content.pipeline import (
    DefaultStateManager,
    DefaultComponentCoordinator,
    DefaultEventSystem,
    PipelineConfig
)

# Configure logger
logger = get_logger(__name__)

class AppState:
    """Container for application state."""
    def __init__(self):
        self.pipeline_service: PipelineService = None
        self.db_connection: DatabaseConnection = None
        self.schema_manager: SchemaManager = None

    async def initialize(self):
        """Initialize application services."""
        # Initialize database connection
        config = load_config()
        db_config = ConnectionConfig(
            uri=config["neo4j_uri"],
            username=config["neo4j_username"],
            password=config["neo4j_password"]
        )
        self.db_connection = DatabaseConnection(db_config)
        await self.db_connection.initialize()

        # Initialize schema manager
        self.schema_manager = SchemaManager(self.db_connection)
        await self.schema_manager.initialize()

        # Create pipeline config
        pipeline_config = PipelineConfig(
            max_concurrent_pages=10,
            event_logging_enabled=True
        )
        
        # Create pipeline dependencies
        state_manager = DefaultStateManager(config=pipeline_config)
        component_coordinator = DefaultComponentCoordinator(config=pipeline_config)
        event_system = DefaultEventSystem(config=pipeline_config)
        

        # Initialize pipeline service
        self.pipeline_service = PipelineService(
            state_manager=state_manager,
            component_coordinator=component_coordinator,
            event_system=event_system,
            config=pipeline_config,
            db_connection=self.db_connection
        )
        await self.pipeline_service.initialize()

    async def cleanup(self):
        """Cleanup application services."""
        if self.db_connection:
            await self.db_connection.shutdown()
        if self.pipeline_service:
            await self.pipeline_service.cleanup()

    # Property for config_dir
    @property
    def config_dir(self) -> str:
        """Get the configuration directory."""
        import os
        return os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "config")

    # Property for auth_config
    @property
    def auth_config(self):
        """Get the auth provider configuration."""
        if not hasattr(self, "_auth_config"):
            # Will be initialized during app startup
            self._auth_config = None
        return self._auth_config

    # Method to initialize auth config
    async def initialize_auth_config(self):
        """Initialize the auth provider configuration."""
        config_dir = os.path.join(self.config_dir, "auth")
        self._auth_config = get_auth_provider_config(config_dir)
        
        # Ensure we can get the local provider
        self._auth_config.get_provider("local")
        self.logger.info("Auth provider configuration initialized")

    # Update initialize method to call initialize_auth_config
    async def initialize(self):
        """Initialize all application services."""
        # Initialize database connection
        self.logger.info("Initializing database connection")
        await self.initialize_database()
        
        # Initialize schema manager
        self.logger.info("Initializing schema manager")
        await self.initialize_schema_manager()
        
        # Initialize graph operations
        self.logger.info("Initializing graph operations")
        await self.initialize_graph_operations()
        
        # Initialize pipeline service
        self.logger.info("Initializing pipeline service")
        await self.initialize_pipeline_service()
        
        # Initialize auth config
        self.logger.info("Initializing auth provider configuration")
        await self.initialize_auth_config()
        
        self.initialized = True
        self.logger.info("Application state initialized successfully")

app_state = AppState()

async def get_app_state() -> AppState:
    """Dependency to get the global app state."""
    return app_state