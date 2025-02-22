import asyncio
import uuid

from core.llm.providers.base.provider import (
    ProviderConfig,
    ProviderType,
    ModelCapability,
    QueryRequest
)
from core.llm.factory.factory import LLMProviderFactory
from core.llm.providers.ollama.client import OllamaProvider

from core.utils.logger import get_logger

logger = get_logger(__name__)

async def test_ollama_provider():
    logger.info("Starting Ollama provider test...")
    
    # Create factory and register Ollama provider
    factory = LLMProviderFactory()
    factory.register_provider(ProviderType.OLLAMA, OllamaProvider)
    
    # Log the provider registry for debugging
    logger.info(f"Provider registry: {factory._provider_registry}")
    
    # Configure provider for testing
    config = ProviderConfig(
        provider_type=ProviderType.OLLAMA,
        model_name="llama2",  # Change this to a model you have available
        capabilities=[
            ModelCapability.COMPLETION,
            ModelCapability.CHAT,
            ModelCapability.STREAMING
        ],
        max_tokens=2000,
        timeout_seconds=30,
        auth_config={
            "base_url": "http://localhost:11434"
        }
    )
    
    # Log the config for debugging
    logger.info(f"Provider type from config: {config.provider_type}")
    logger.info(f"Provider type value from config: {config.provider_type.value}")
    
    try:
        # Test provider creation and initialization
        logger.info("Initializing provider...")
        provider = await factory.create_provider(config)
        
        # Check provider status
        logger.info("Checking provider status...")
        status = await provider.get_status()
        logger.info(f"Provider status: {status.status}")
        logger.info(f"Model capabilities: {status.capabilities}")
        
        # Test basic query
        logger.info("Testing basic query...")
        request = QueryRequest(
            query_id=uuid.uuid4(),
            prompt="Explain what makes a good test case in three sentences.",
            max_tokens=100,
            temperature=0.7,
            stream=False
        )
        
        response = await provider.query(request)
        
        logger.info("Query Results:")
        logger.info(f"Response content: {response.content}")
        logger.info(f"Latency: {response.latency_ms:.2f}ms")
        logger.info(f"Token usage: {response.token_usage}")
        
        # Test streaming query
        logger.info("Testing streaming query...")
        streaming_request = QueryRequest(
            query_id=uuid.uuid4(),
            prompt="Count from 1 to 5 slowly.",
            max_tokens=50,
            temperature=0.7,
            stream=True
        )
        
        streaming_response = await provider.query(streaming_request)
        logger.info(f"Streaming response: {streaming_response.content}")
        
        # Check final metrics
        final_status = await provider.get_status()
        logger.info("Final provider metrics:")
        logger.info(f"Total requests: {final_status.metrics.total_requests}")
        logger.info(f"Successful requests: {final_status.metrics.successful_requests}")
        logger.info(f"Average latency: {final_status.metrics.average_latency_ms:.2f}ms")
        
    except Exception as e:
        logger.error(f"Error during testing: {str(e)}")
        raise
    
    finally:
        # Cleanup
        logger.info("Shutting down provider...")
        await factory.shutdown_all()

if __name__ == "__main__":
    asyncio.run(test_ollama_provider())