from abc import ABC, abstractmethod
from typing import Dict, Optional, List, Any, AsyncIterator
from dataclasses import dataclass
from enum import Enum
import asyncio
import json
from pathlib import Path
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

class ConfigChangeType(Enum):
    """Types of configuration changes that can occur"""
    ADDED = "added"
    UPDATED = "updated"
    REMOVED = "removed"
    ENABLED = "enabled"
    DISABLED = "disabled"

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
    async def validate(self, config: Dict[str, Any]) -> bool:
        """Validate provider-specific configuration"""
        pass
    
    @abstractmethod
    async def get_schema(self) -> Dict[str, Any]:
        """Get JSON schema for provider configuration"""
        pass

class ProviderConfigManager:
    """Manages LLM provider configurations with runtime updates"""
    
    def __init__(self, config_path: Path):
        self.config_path = config_path
        self._configs: Dict[str, Dict[str, Any]] = {}
        self._validators: Dict[str, ProviderConfigValidator] = {}
        self._enabled_providers: set[str] = set()
        self._change_listeners: List[asyncio.Queue[ConfigChangeEvent]] = []
        self._lock = asyncio.Lock()
    
    async def initialize(self) -> None:
        """Initialize the configuration manager"""
        try:
            if self.config_path.exists():
                config_data = json.loads(self.config_path.read_text())
                async with self._lock:
                    self._configs = config_data.get("providers", {})
                    self._enabled_providers = set(config_data.get("enabled_providers", []))
            logger.info(f"Initialized provider config manager with {len(self._configs)} providers")
        except Exception as e:
            logger.error(f"Failed to initialize provider config manager: {e}")
            raise
    
    async def save(self) -> None:
        """Persist current configuration to disk"""
        async with self._lock:
            config_data = {
                "providers": self._configs,
                "enabled_providers": list(self._enabled_providers),
                "last_updated": datetime.utcnow().isoformat()
            }
            self.config_path.write_text(json.dumps(config_data, indent=2))
    
    async def register_validator(self, provider_type: str, validator: ProviderConfigValidator) -> None:
        """Register a validator for a provider type"""
        self._validators[provider_type] = validator
        logger.info(f"Registered validator for provider type: {provider_type}")
    
    async def add_provider(self, provider_id: str, config: Dict[str, Any]) -> None:
        """Add a new provider configuration"""
        provider_type = config.get("provider_type")
        if not provider_type:
            raise ValueError("Provider configuration must include 'provider_type'")
            
        validator = self._validators.get(provider_type)
        if validator and not await validator.validate(config):
            raise ValueError(f"Invalid configuration for provider type: {provider_type}")
        
        async with self._lock:
            self._configs[provider_id] = config
            await self._emit_change(ConfigChangeEvent(
                provider_id=provider_id,
                change_type=ConfigChangeType.ADDED,
                timestamp=datetime.utcnow(),
                new_config=config
            ))
            await self.save()
    
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
                timestamp=datetime.utcnow(),
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
                    timestamp=datetime.utcnow(),
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
                timestamp=datetime.utcnow()
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
                timestamp=datetime.utcnow()
            ))
            await self.save()
    
    async def get_provider_config(self, provider_id: str) -> Optional[Dict[str, Any]]:
        """Get configuration for a specific provider"""
        return self._configs.get(provider_id)
    
    async def get_enabled_providers(self) -> List[Dict[str, Any]]:
        """Get configurations for all enabled providers"""
        return [self._configs[pid] for pid in self._enabled_providers]
    
    async def subscribe_to_changes(self) -> AsyncIterator[ConfigChangeEvent]:
        """Subscribe to configuration changes"""
        queue: asyncio.Queue[ConfigChangeEvent] = asyncio.Queue()
        self._change_listeners.append(queue)
        try:
            while True:
                yield await queue.get()
        finally:
            self._change_listeners.remove(queue)
    
    async def _emit_change(self, event: ConfigChangeEvent) -> None:
        """Emit a configuration change event to all listeners"""
        for queue in self._change_listeners:
            await queue.put(event)
