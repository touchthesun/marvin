import asyncio
from pathlib import Path

from core.llm.providers.ollama.models.config import OllamaProviderConfig
from core.llm.providers.config.config_manager import ConfigManagerSingleton
from core.llm.providers.base.config import ProviderType
from core.llm.providers.ollama.validator import OllamaConfigValidator
from core.llm.providers.ollama.models.request import GenerateRequest
from core.llm.factory.factory import LLMProviderFactory
from core.llm.providers.base.provider import ModelCapability

from core.utils.logger import get_logger

logger = get_logger(__name__)


test_config = OllamaProviderConfig(
    model_name="llama2:latest",
    capabilities=[
        ModelCapability.COMPLETION,
        ModelCapability.CHAT,
        ModelCapability.STREAMING
    ],
    max_tokens=2048
)

async def test_ollama_connection():
    """Test Ollama provider connection and basic operations"""
    config_path = Path("config/llm_providers.json")
    
    try:
        # Get and initialize singleton config manager instance
        logger.info("Getting config manager instance")
        config_manager = await ConfigManagerSingleton.get_instance(config_path)
        
        logger.info(f"Using config manager instance {id(config_manager)}")
        
        # Register validator only once
        logger.info("Registering Ollama validator")
        validator = OllamaConfigValidator()
        await config_manager.register_validator(ProviderType.OLLAMA, validator)
        
        # Add Ollama provider configuration
        logger.info("Adding Ollama provider")
        await config_manager.add_provider("local-ollama", test_config)
        
        # Create factory and provider
        logger.info("Creating LLM provider factory")
        factory = LLMProviderFactory(config_manager)
        
        logger.info("Getting provider config")
        config = await config_manager.get_provider_config("local-ollama")
        if not config:
            raise ValueError("Failed to retrieve provider configuration")
        logger.debug(f"Retrieved config: {config}")
        
        logger.info("Creating provider through factory")
        provider = await factory.create_provider("local-ollama")
        
        # Test operations
        logger.info("Testing basic model operations")
        models = await provider.list_local_models()
        logger.info(f"Available models: {models}")
        
        logger.info("Testing simple generation")
        final_response = None
        async for response in provider.generate(
            GenerateRequest(
                model="llama2:latest",
                prompt="Hello, how are you?"
            )
        ):
            final_response = response
            if response.done:
                break
        logger.info(f"Final response: {final_response.response}")

        
    except Exception as e:
        logger.error(f"Test failed: {str(e)}", exc_info=True)
        raise


if __name__ == "__main__":
    asyncio.run(test_ollama_connection())
