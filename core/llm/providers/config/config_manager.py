from abc import ABC, abstractmethod
from typing import Dict, Optional, List, Any, AsyncIterator
from dataclasses import dataclass
from enum import Enum
import asyncio
import json
import threading
from pathlib import Path
from datetime import datetime

from core.llm.providers.base.config import ProviderConfig, ProviderType
from core.llm.providers.base.exceptions import ProviderConfigError
from core.utils.logger import get_logger

# Initialize logging
logger = get_logger(__name__)

class ConfigChangeType(Enum):
    """Types of configuration changes that can occur"""
    ADDED = "added"
    UPDATED = "updated"
    REMOVED = "removed"
    ENABLED = "enabled"
    DISABLED = "disabled"

@dataclass
class ConfigurationSchema:
    """Schema information for provider configuration"""
    version: str
    schema: Dict[str, Any]
    provider_type: ProviderType



@dataclass
class ConfigChangeEvent:
    """Event emitted when provider configuration changes"""
    provider_id: str
    change_type: ConfigChangeType
    timestamp: datetime
    old_config: Optional[Dict[str, Any]] = None
    new_config: Optional[Dict[str, Any]] = None

class ProviderConfigValidator(ABC):
    """Abstract base class for provider-specific config validation"""
    
    @abstractmethod
    async def validate(self, config: ProviderConfig) -> bool:
        """Validate provider-specific configuration"""
        pass
    
    @abstractmethod
    async def get_schema(self) -> ConfigurationSchema:
        """Get JSON schema for provider configuration"""
        pass
    
    @abstractmethod
    async def check_dependencies(self) -> bool:
        """Verify provider dependencies are satisfied"""
        pass





class ProviderConfigManager:
    """Manages LLM provider configurations with runtime updates"""
    
    def __init__(self, config_path: Path):
        self.logger = get_logger(__name__)
        self.logger.debug(f"Initializing ProviderConfigManager with path: {config_path}")
        
        self.config_path = config_path
        self._storage: Optional[ConfigurationStorage] = None
        self._validators: Dict[ProviderType, ProviderConfigValidator] = {}
        self._change_listeners: List[asyncio.Queue[ConfigChangeEvent]] = []
        self._lock = asyncio.Lock()
        self._config_version = "1.0"
        
        self.logger.debug("ProviderConfigManager instance initialized")

    async def get_enabled_providers(self) -> List[Dict[str, Any]]:
        """Get configurations for all enabled providers"""
        if not self._storage:
            raise RuntimeError("Configuration storage not initialized")
            
        return [
            config.model_dump() if isinstance(config, ProviderConfig) else config
            for pid, config in self._storage.providers.items()
            if pid in self._storage.enabled_providers
        ]

    async def list_providers(self) -> List[str]:
        """List all configured providers"""
        if not self._storage:
            raise RuntimeError("Configuration storage not initialized")
        return list(self._storage.providers.keys())


    async def initialize(self) -> None:
        """Initialize configuration from disk"""
        self.logger.debug("Starting configuration initialization")
        try:
            if self.config_path.exists():
                data = json.loads(self.config_path.read_text())
                self.logger.debug(f"Loaded existing configuration: {json.dumps(data, indent=2)}")
                
                async with self._lock:
                    self._storage = ConfigurationStorage.from_json(data)
                    # Validate all loaded configurations
                    for pid, config in self._storage.providers.items():
                        validator = self._validators.get(config.provider_type)
                        if validator and not await validator.validate(config):
                            self.logger.warning(f"Invalid configuration loaded for provider {pid}")
                            # Optionally disable invalid configurations
                            self._storage.enabled_providers.remove(pid)
            else:
                self.logger.debug("No existing configuration found, creating empty storage")
                # Initialize empty storage
                self._storage = ConfigurationStorage(
                    version="1.0",
                    last_updated=datetime.now(),
                    providers={},
                    enabled_providers=[]
                )
                await self._persist()
                
            self.logger.info(
                f"Initialized provider config manager with "
                f"{len(self._storage.providers)} providers"
            )
        except Exception as e:
            self.logger.error(f"Failed to initialize provider config manager: {e}")
            raise
    
    async def save(self) -> None:
        """Persist current configuration to disk"""
        async with self._lock:
            config_data = {
                "providers": self._configs,
                "enabled_providers": list(self._enabled_providers),
                "last_updated": datetime.now().isoformat()
            }
            self.config_path.write_text(json.dumps(config_data, indent=2))
    
    async def register_validator(self, provider_type: ProviderType, validator: ProviderConfigValidator) -> None:
        """Register a validator for a provider type"""
        self._validators[provider_type] = validator
        logger.info(f"Registered validator for provider type: {provider_type.value}")
    
 
    async def update_provider(self, provider_id: str, config: Dict[str, Any]) -> None:
        """Update an existing provider configuration"""
        if provider_id not in self._configs:
            raise KeyError(f"Provider not found: {provider_id}")
            
        provider_type = config.get("provider_type")
        validator = self._validators.get(provider_type)
        if validator and not await validator.validate(config):
            raise ValueError(f"Invalid configuration for provider type: {provider_type}")
        
        async with self._lock:
            old_config = self._configs[provider_id]
            self._configs[provider_id] = config
            await self._emit_change(ConfigChangeEvent(
                provider_id=provider_id,
                change_type=ConfigChangeType.UPDATED,
                timestamp=datetime.now(),
                old_config=old_config,
                new_config=config
            ))
            await self.save()
    
    async def remove_provider(self, provider_id: str) -> None:
        """Remove a provider configuration"""
        async with self._lock:
            if provider_id in self._configs:
                old_config = self._configs.pop(provider_id)
                self._enabled_providers.discard(provider_id)
                await self._emit_change(ConfigChangeEvent(
                    provider_id=provider_id,
                    change_type=ConfigChangeType.REMOVED,
                    timestamp=datetime.now(),
                    old_config=old_config
                ))
                await self.save()
    
    async def enable_provider(self, provider_id: str) -> None:
        """Enable a provider"""
        if provider_id not in self._configs:
            raise KeyError(f"Provider not found: {provider_id}")
            
        async with self._lock:
            self._enabled_providers.add(provider_id)
            await self._emit_change(ConfigChangeEvent(
                provider_id=provider_id,
                change_type=ConfigChangeType.ENABLED,
                timestamp=datetime.now()
            ))
            await self.save()
    
    async def disable_provider(self, provider_id: str) -> None:
        """Disable a provider"""
        if provider_id not in self._configs:
            raise KeyError(f"Provider not found: {provider_id}")
            
        async with self._lock:
            self._enabled_providers.discard(provider_id)
            await self._emit_change(ConfigChangeEvent(
                provider_id=provider_id,
                change_type=ConfigChangeType.DISABLED,
                timestamp=datetime.now()
            ))
            await self.save()

    
    async def subscribe_to_changes(self) -> AsyncIterator[ConfigChangeEvent]:
        """Subscribe to configuration changes"""
        queue: asyncio.Queue[ConfigChangeEvent] = asyncio.Queue()
        self._change_listeners.append(queue)
        try:
            while True:
                yield await queue.get()
        finally:
            self._change_listeners.remove(queue)


    async def list_available_provider_types(self) -> List[ProviderType]:
        """List all available provider types"""
        return list(self._validators.keys())
    
    async def get_provider_schema(self, provider_type: ProviderType) -> Optional[ConfigurationSchema]:
        """Get configuration schema for a provider type"""
        validator = self._validators.get(provider_type)
        if validator:
            return await validator.get_schema()
        return None
    
    async def check_provider_health(self, provider_id: str) -> bool:
        """Check if a provider's configuration is healthy"""
        config = self._configs.get(provider_id)
        if not config:
            return False
            
        validator = self._validators.get(config.provider_type)
        if not validator:
            return False
            
        try:
            is_valid = await validator.validate(config)
            has_deps = await validator.check_dependencies()
            return is_valid and has_deps
        except Exception as e:
            logger.error(f"Health check failed for provider {provider_id}: {e}")
            return False
        
    async def _persist(self) -> None:
        """Persist configuration to disk"""
        if not self._storage:
            raise RuntimeError("Configuration storage not initialized")

        self.logger.info("Starting configuration persistence")
        self.logger.debug(f"Lock state before persist: locked={self._lock.locked()}")
        
        async def _do_persist():
            self.logger.debug("Attempting to acquire lock")
            async with self._lock:
                self.logger.debug("Lock acquired")
                self._storage.last_updated = datetime.now()
                self.logger.debug(f"Persisting configuration to {self.config_path}")
                
                # Create parent directories if they don't exist
                self.config_path.parent.mkdir(parents=True, exist_ok=True)
                
                # Write atomically using temporary file
                temp_path = self.config_path.with_suffix('.tmp')
                try:
                    config_data = self._storage.to_json()
                    self.logger.debug(f"Writing config data: {len(str(config_data))} bytes")
                    
                    temp_path.write_text(json.dumps(config_data, indent=2))
                    temp_path.replace(self.config_path)
                    
                    self.logger.info(f"Successfully persisted configuration to {self.config_path}")
                finally:
                    if temp_path.exists():
                        temp_path.unlink()
                        self.logger.debug("Cleaned up temporary file")
            self.logger.debug("Lock released")

        try:
            self.logger.debug("Starting persist operation with timeout")
            await asyncio.wait_for(_do_persist(), timeout=10.0)
            self.logger.debug("Persist operation completed")
        except asyncio.TimeoutError:
            self.logger.error(f"Persistence operation timed out. Lock state: locked={self._lock.locked()}")
            raise
        except Exception as e:
            self.logger.error(f"Failed to persist configuration: {e}", exc_info=True)
            raise

    
    async def _emit_change(self, event: ConfigChangeEvent) -> None:
        """Emit a configuration change event to all listeners"""
        logger.debug(f"Emitting config change event: {event}")
        logger.debug(f"Event type: {type(event)}")
        logger.debug(f"Event attributes: {event.__dict__}")
        
        for queue in self._change_listeners:
            await queue.put(event)

    async def add_provider(self, provider_id: str, config: ProviderConfig) -> None:
        """Add a new provider configuration"""
        self.logger.info(f"Starting add_provider for {provider_id}")
        self.logger.debug(f"Initial lock state: locked={self._lock.locked()}")
        
        try:
            if not self._storage:
                raise RuntimeError("Configuration storage not initialized")
                
            if not isinstance(config, ProviderConfig):
                raise ValueError("Config must be an instance of ProviderConfig")
            
            # Validate configuration
            validator = self._validators.get(config.provider_type)
            if validator:
                validation_result = await validator.validate(config.model_dump())
                if not validation_result:
                    raise ValueError(f"Invalid configuration for provider type: {config.provider_type}")
            
            # Use a single async with block for all operations that need the lock
            async with self._lock:
                self.logger.debug("Lock acquired in add_provider")
                
                # Store the configuration object (not dict)
                self._storage.providers[provider_id] = config
                
                # Create and emit change event
                change_event = ConfigChangeEvent(
                    provider_id=provider_id,
                    change_type=ConfigChangeType.ADDED,
                    timestamp=datetime.now(),
                    new_config=config.model_dump()
                )
                await self._emit_change(change_event)
                
                # Persist changes
                self.logger.info("Persisting configuration changes")
                self._storage.last_updated = datetime.now()
                
                # Write configuration to disk
                temp_path = self.config_path.with_suffix('.tmp')
                try:
                    self.logger.debug("Converting configuration to JSON")
                    config_data = {
                        "version": self._storage.version,
                        "last_updated": self._storage.last_updated.isoformat(),
                        "providers": {
                            pid: prov.model_dump() 
                            for pid, prov in self._storage.providers.items()
                        },
                        "enabled_providers": self._storage.enabled_providers
                    }
                    
                    self.logger.debug(f"Writing configuration to {temp_path}")
                    temp_path.write_text(json.dumps(config_data, indent=2))
                    temp_path.replace(self.config_path)
                    self.logger.info("Successfully persisted configuration")
                finally:
                    if temp_path.exists():
                        temp_path.unlink()
                
            self.logger.debug("Lock released in add_provider")
                
        except Exception as e:
            self.logger.error(f"Failed to add provider {provider_id}: {e}")
            raise
    
    async def get_provider_config(self, provider_id: str) -> Optional[Dict[str, Any]]:
        """Get configuration for a specific provider"""
        if not self._storage:
            raise RuntimeError("Configuration storage not initialized")
            
        logger.debug(f"Retrieving config for provider: {provider_id}")
        logger.debug(f"Available providers: {list(self._storage.providers.keys())}")
        
        config = self._storage.providers.get(provider_id)
        if config:
            logger.debug(f"Found config: {config}")
            # If stored as Pydantic model, convert to dict
            return config.model_dump() if hasattr(config, 'model_dump') else config
        
        logger.warning(f"No configuration found for provider: {provider_id}")
        return None


@dataclass
class ConfigurationStorage:
    """Storage model for provider configurations"""
    version: str
    last_updated: datetime
    providers: Dict[str, ProviderConfig]
    enabled_providers: List[str]
    
    @classmethod
    def from_json(cls, data: dict) -> "ConfigurationStorage":
        return cls(
            version=data["version"],
            last_updated=datetime.fromisoformat(data["last_updated"]),
            providers={
                pid: ProviderConfig.from_json(pdata) 
                for pid, pdata in data["providers"].items()
            },
            enabled_providers=data["enabled_providers"]
        )
    
    def to_json(self) -> dict:
        return {
            "version": self.version,
            "last_updated": self.last_updated.isoformat(),
            "providers": {
                pid: config.to_json() 
                for pid, config in self.providers.items()
            },
            "enabled_providers": self.enabled_providers
        }


class ConfigManagerSingleton:
    _instance: Optional[ProviderConfigManager] = None
    _init_lock = asyncio.Lock()
    _initialized = False
    _creation_in_progress = False
    
    @classmethod
    async def get_instance(cls, config_path: Path) -> ProviderConfigManager:
        """Get or create the singleton instance"""
        logger.debug(f"[{id(cls)}] Getting instance. Init lock state: locked={cls._init_lock.locked()}")
        
        if cls._instance is not None:
            logger.debug(f"[{id(cls)}] Returning existing instance {id(cls._instance)}")
            return cls._instance
            
        if cls._creation_in_progress:
            logger.debug(f"[{id(cls)}] Creation in progress, waiting...")
            while cls._creation_in_progress and cls._instance is None:
                await asyncio.sleep(0.1)
            if cls._instance is not None:
                return cls._instance
        
        try:
            cls._creation_in_progress = True
            logger.debug(f"[{id(cls)}] Attempting to acquire init lock")
            async with cls._init_lock:
                logger.debug(f"[{id(cls)}] Acquired init lock")
                # Double check pattern inside lock
                if cls._instance is not None:
                    return cls._instance
                    
                logger.debug(f"[{id(cls)}] Creating new instance")
                instance = ProviderConfigManager(config_path)
                await instance.initialize()
                cls._instance = instance
                cls._initialized = True
                logger.debug(f"[{id(cls)}] Created and initialized instance {id(instance)}")
                return instance
                
        finally:
            cls._creation_in_progress = False
            logger.debug(f"[{id(cls)}] Released creation lock")
            
    @classmethod
    def _create_initial_config(cls, config_path: Path) -> None:
        """Create initial configuration file if it doesn't exist"""
        if not config_path.exists():
            logger.debug(f"Creating initial config at {config_path}")
            config_dir = config_path.parent
            config_dir.mkdir(parents=True, exist_ok=True)
            
            initial_config = {
                "version": "1.0",
                "last_updated": datetime.now().isoformat(),
                "providers": {},
                "enabled_providers": []
            }
            
            with open(config_path, 'w') as f:
                json.dump(initial_config, f, indent=2)
            logger.debug("Initial config created")
    
    @classmethod
    async def reinitialize_instance(cls) -> None:
        """Force reinitialization of the singleton instance if needed.
        This is separate from get_instance for cases where we need to reinitialize
        an existing instance without creating a new one.
        """
        logger.debug(f"[{id(cls)}] Attempting to reinitialize instance")
        
        if not cls._instance:
            raise RuntimeError("Cannot reinitialize: instance not created")
            
        async with cls._init_lock:
            await cls._instance.initialize()
            cls._initialized = True
            logger.debug(f"[{id(cls)}] Reinitialized instance {id(cls._instance)}")
    