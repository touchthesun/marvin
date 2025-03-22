import json
from fastapi import APIRouter, HTTPException, Depends, Body
from fastapi.responses import StreamingResponse

from api.state import get_app_state
from core.utils.logger import get_logger
from api.models.llm.request import GenerationRequest, ModelListRequest
from api.models.common import APIResponse



router = APIRouter(prefix="/llm", tags=["llm"])
logger = get_logger(__name__)


@router.post("/generate", response_model=APIResponse)
async def generate_completion(
    request: GenerationRequest = Body(...),
    app_state = Depends(get_app_state)
):
    """Generate a completion using any supported provider"""
    if not app_state.llm_factory:
        raise HTTPException(status_code=500, detail="LLM factory not initialized")
    
    try:
        # Get the appropriate provider
        async with app_state.llm_factory.get_provider_context(
            request.provider_id, request.model_id
        ) as provider:
            # Convert generic request to provider-specific request
            provider_request = await _convert_to_provider_request(
                provider.provider_type, request
            )
            
            # Handle non-streaming response
            if not request.stream:
                response_data = {}
                async for response in provider.generate(provider_request):
                    response_data = {
                        "model": response.model,
                        "response": response.response,
                        "tokens": {
                            "prompt": getattr(response, "prompt_tokens", 0),
                            "completion": getattr(response, "completion_tokens", 0),
                            "total": getattr(response, "total_tokens", 0)
                        }
                    }
                
                return {"success": True, "data": response_data}
            
            # Handle streaming response
            async def generate_stream():
                try:
                    async for chunk in provider.generate(provider_request):
                        yield f"data: {json.dumps({'text': chunk.response, 'done': chunk.done})}\n\n"
                        if getattr(chunk, "done", False):
                            break
                except Exception as e:
                    logger.error(f"Error in stream generation: {str(e)}", exc_info=True)
                    yield f"data: {json.dumps({'error': str(e)})}\n\n"
            
            return StreamingResponse(
                generate_stream(),
                media_type="text/event-stream"
            )
    except Exception as e:
        logger.error(f"Error in generate: {str(e)}", exc_info=True)
        return {"success": False, "error": str(e)}

@router.post("/models", response_model=APIResponse)
async def list_models(
    request: ModelListRequest = Body(...),
    app_state = Depends(get_app_state)
):
    """List available models for any provider"""
    if not app_state.llm_factory:
        raise HTTPException(status_code=500, detail="LLM factory not initialized")
    
    try:
        # Use a default model just to initialize the provider
        default_models = {
            "anthropic": "claude-3-haiku-20240307",
            "ollama": "llama3",
            "openai": "gpt-3.5-turbo"
        }
        
        if request.provider_id not in default_models:
            return {
                "success": False,
                "error": f"Unsupported provider: {request.provider_id}"
            }
            
        default_model = default_models[request.provider_id]
        
        async with app_state.llm_factory.get_provider_context(
            request.provider_id, default_model
        ) as provider:
            models = await provider.list_models()
            return {
                "success": True,
                "data": {
                    "provider": request.provider_id,
                    "models": models
                }
            }
    except Exception as e:
        logger.error(f"Error listing models: {str(e)}", exc_info=True)
        return {"success": False, "error": str(e)}

@router.get("/providers", response_model=APIResponse)
async def list_providers(
    app_state = Depends(get_app_state)
):
    """List all available LLM providers"""
    if not app_state.llm_factory:
        raise HTTPException(status_code=500, detail="LLM factory not initialized")
    
    try:
        providers = await app_state.llm_factory.list_providers()
        return {
            "success": True,
            "data": {
                "providers": providers
            }
        }
    except Exception as e:
        logger.error(f"Error listing providers: {str(e)}", exc_info=True)
        return {"success": False, "error": str(e)}

async def _convert_to_provider_request(provider_type, request: GenerationRequest):
    """Convert generic request to provider-specific request"""
    # If provider_type is an object with provider_type attribute, use that
    if hasattr(provider_type, "provider_type"):
        provider_type = provider_type.provider_type
    
    # If it's a ProviderType enum, convert to string
    if hasattr(provider_type, "value"):
        provider_type = provider_type.value
    
    # Otherwise assume it's already a string and convert to lowercase
    provider_type = str(provider_type).lower()
    
    if provider_type == "anthropic":
        from core.llm.providers.anthropic.models.request import GenerateRequest
        return GenerateRequest(
            prompt=request.prompt,
            system=request.system_prompt,
            model=request.model_id,
            max_tokens=request.max_tokens,
            temperature=request.temperature,
            stream=request.stream,
            **request.additional_params
        )
    elif provider_type == "ollama":
        from core.llm.providers.ollama.models.request import GenerateRequest
        return GenerateRequest(
            prompt=request.prompt,
            system=request.system_prompt,
            model=request.model_id,
            num_predict=request.max_tokens,
            temperature=request.temperature,
            stream=request.stream,
            **request.additional_params
        )
    # Add more provider conversions as needed
    else:
        raise ValueError(f"Unsupported provider type: {provider_type}")