import json
from fastapi import APIRouter, HTTPException, Query, Depends
from fastapi.responses import StreamingResponse
from typing import Optional

from api.state import get_app_state
from core.utils.config import load_config
from core.utils.logger import get_logger
from core.llm.providers.base.provider import ProviderType
from core.llm.providers.anthropic.models.request import GenerateRequest

router = APIRouter(prefix="/llm", tags=["llm"])

@router.post("/anthropic/test")
async def test_anthropic(
    prompt: str = Query("Say hello and introduce yourself briefly.", description="Prompt to send"),
    model: str = Query("claude-3-haiku-20240307", description="Model to use")
):
    """Test the Anthropic provider integration"""
    app_state = get_app_state()
    
    if not app_state.llm_factory:
        raise HTTPException(status_code=500, detail="LLM factory not initialized")
    
    try:
        async with app_state.llm_factory.get_provider_context("anthropic", model) as provider:
            # Create simple request
            request = GenerateRequest(
                prompt=prompt,
                model=model,
                max_tokens=300,
                temperature=0.7,
                stream=False
            )
            
            # Get first (and only) response
            async for response in provider.generate(request):
                return {
                    "success": True,
                    "model": response.model,
                    "response": response.response,
                    "tokens": {
                        "prompt": response.prompt_tokens,
                        "completion": response.completion_tokens,
                        "total": response.total_tokens
                    }
                }
                
        return {"success": False, "error": "No response received"}
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "error_type": type(e).__name__
        }

@router.get("/anthropic/generate")
async def generate_streaming(
    prompt: str = Query(..., description="Prompt to send to Claude"),
    system: Optional[str] = Query(None, description="Optional system prompt"),
    model: str = Query("claude-3-haiku-20240307", description="Model name"),
    max_tokens: int = Query(1000, description="Maximum tokens to generate"),
    temperature: float = Query(0.7, description="Temperature (0.0-1.0)")
):
    """Generate a streaming response from Claude"""
    app_state = get_app_state()
    
    if not app_state.llm_factory:
        raise HTTPException(status_code=500, detail="LLM factory not initialized")
    
    try:
        # Create an async generator for the streaming response
        async def generate_stream():
            try:
                async with app_state.llm_factory.get_provider_context("anthropic", model) as provider:
                    request = GenerateRequest(
                        prompt=prompt,
                        system=system,
                        model=model,
                        max_tokens=max_tokens,
                        temperature=temperature,
                        stream=True
                    )
                    
                    async for chunk in provider.generate(request):
                        # Convert to a format suitable for SSE
                        yield f"data: {json.dumps({'text': chunk.response, 'done': chunk.done})}\n\n"
                        
                        if chunk.done:
                            break
                            
            except Exception as e:
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
                
        return StreamingResponse(
            generate_stream(),
            media_type="text/event-stream"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/models")
async def list_models(
    provider: str = Query("anthropic", description="Provider type")
):
    """List available models for a provider"""
    app_state = get_app_state()
    
    if not app_state.llm_factory:
        raise HTTPException(status_code=500, detail="LLM factory not initialized")
    
    try:
        # Use a default model name just to get the provider instance
        if provider == "anthropic":
            provider_enum = ProviderType.ANTHROPIC
            default_model = "claude-3-haiku-20240307"
        elif provider == "ollama":
            provider_enum = ProviderType.OLLAMA
            default_model = "llama3"
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported provider: {provider}")
            
        async with app_state.llm_factory.get_provider_context(provider, default_model) as provider_instance:
            models = await provider_instance.list_models()
            return {
                "success": True,
                "provider": provider,
                "models": models
            }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "error_type": type(e).__name__
        }