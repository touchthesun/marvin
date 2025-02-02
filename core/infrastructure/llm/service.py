from langchain.llms.base import BaseLLM
from langchain.chat_models import ChatOpenAI, ChatAnthropic
from langchain.llms import Ollama
from typing import Optional, Dict, Any
from abc import ABC, abstractmethod

class ModelConfig:
    """Configuration for model initialization"""
    def __init__(
        self,
        model_type: str,  # "local" or "cloud"
        model_name: str,  # e.g., "llama2", "gpt-4", "claude-3"
        provider: Optional[str] = None,  # e.g., "openai", "anthropic"
        api_key: Optional[str] = None,
        model_params: Optional[Dict[str, Any]] = None
    ):
        self.model_type = model_type
        self.model_name = model_name
        self.provider = provider
        self.api_key = api_key
        self.model_params = model_params or {}

class MarvinLLMService:
    """Central service for managing LLM interactions"""
    
    def __init__(self):
        self._llm: Optional[BaseLLM] = None
        self._config: Optional[ModelConfig] = None

    def initialize_model(self, config: ModelConfig) -> None:
        """Initialize the LLM based on configuration"""
        self._config = config
        
        if config.model_type == "local":
            self._llm = Ollama(
                model=config.model_name,
                **config.model_params
            )
        
        elif config.model_type == "cloud":
            if config.provider == "openai":
                self._llm = ChatOpenAI(
                    model_name=config.model_name,
                    openai_api_key=config.api_key,
                    **config.model_params
                )
            elif config.provider == "anthropic":
                self._llm = ChatAnthropic(
                    model=config.model_name,
                    anthropic_api_key=config.api_key,
                    **config.model_params
                )
            else:
                raise ValueError(f"Unsupported cloud provider: {config.provider}")

    @property
    def llm(self) -> BaseLLM:
        """Get the current LLM instance"""
        if self._llm is None:
            raise RuntimeError("LLM not initialized. Call initialize_model first.")
        return self._llm

    def get_current_config(self) -> Optional[ModelConfig]:
        """Get the current model configuration"""
        return self._config



# Example usage:
# if __name__ == "__main__":
#     # Local model example
#     local_config = ModelConfig(
#         model_type="local",
#         model_name="llama2",
#         model_params={"temperature": 0.7}
#     )
    
#     # Cloud model example
#     cloud_config = ModelConfig(
#         model_type="cloud",
#         model_name="gpt-4",
#         provider="openai",
#         api_key="your-api-key",
#         model_params={"temperature": 0.7}
#     )
    
#     service = MarvinLLMService()
    
#     # Use local model
#     service.initialize_model(local_config)
#     local_llm = service.llm
    
#     # Switch to cloud model
#     service.initialize_model(cloud_config)
#     cloud_llm = service.llm