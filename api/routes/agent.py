from datetime import datetime
from fastapi import APIRouter, Depends, BackgroundTasks
from typing import List, Optional

from api.models.llm.request import GenerationRequest
from api.state import get_app_state
from api.dependencies import get_agent_task_manager
from api.models.agent.request import AgentRequest, AgentTaskType
from api.models.common import APIResponse
from core.utils.logger import get_logger
from api.routes.llm import _convert_to_provider_request

router = APIRouter(prefix="/agent", tags=["agent"])
logger = get_logger(__name__)

router = APIRouter(prefix="/agent", tags=["agent"])
logger = get_logger(__name__)

@router.post("/query", response_model=APIResponse)
async def create_agent_query(
    request: AgentRequest,
    background_tasks: BackgroundTasks,
    task_manager = Depends(get_agent_task_manager),
    app_state = Depends(get_app_state)
):
    """Create a new agent query task with provider flexibility."""
    # Create task
    task_id = await task_manager.create_task({
        "type": request.task_type,
        "query": request.query,
        "relevant_urls": request.relevant_urls or [],
        "provider_id": request.provider_id,  # Pass through the provider_id
        "model_id": request.model_id  # Pass through the model_id
    })
    
    logger.info(f"Created agent task {task_id} for query: {request.query}")
    
    # Start background task
    background_tasks.add_task(
        process_agent_query, 
        task_id,
        request,
        app_state,
        task_manager
    )
    
    return {
        "success": True,
        "data": {
            "task_id": task_id,
            "status": "enqueued",
            "status_endpoint": task_manager.status_path
        }
    }


@router.get("/status/{task_id}", response_model=APIResponse)
async def get_task_status(
    task_id: str,
    task_manager = Depends(get_agent_task_manager)
):
    """Get the status of an agent task."""
    return await task_manager.get_status_response(task_id)


async def process_agent_query(
    task_id: str, 
    request: AgentRequest, 
    app_state,
    task_manager
):
    """Process an agent query task in the background with provider flexibility."""
    logger.info(f"Processing agent task {task_id}: {request.query}")
    
    try:
        # Update status to processing
        await task_manager.update_task(task_id, {
            "status": "processing",
            "progress": 0.2,
            "message": "Retrieving relevant information"
        })
        
        # 1. Get relevant content from knowledge graph
        relevant_content = await get_relevant_content(
            request.query,
            request.relevant_urls,
            app_state
        )
        
        # Update progress
        await task_manager.update_task(task_id, {
            "progress": 0.4,
            "message": "Analyzing content"
        })
        
        # 2. Generate LLM response with provider flexibility
        response_text = await generate_llm_response(
            request.query,
            relevant_content,
            request.task_type,
            request.provider_id,  # Use the requested provider
            request.model_id,     # Use the requested model
            app_state
        )
        
        # Update progress
        await task_manager.update_task(task_id, {
            "progress": 0.8,
            "message": "Finalizing response"
        })
        
        # 3. Create source references
        sources = [
            {
                "url": item["url"],
                "title": item.get("title", item["url"].split("/")[-1]),
                "relevance_score": item.get("relevance", 0.8),
                "accessed_at": datetime.now().isoformat()
            }
            for item in relevant_content
        ]
        
        # 4. Update task with result
        await task_manager.update_task(task_id, {
            "status": "completed",
            "completed_at": datetime.now().isoformat(),
            "progress": 1.0,
            "message": "Task completed successfully",
            "result": {
                "response": response_text,
                "sources": sources,
                "confidence_score": 0.85
            }
        })
        
        logger.info(f"Completed agent task {task_id}")
        
    except Exception as e:
        logger.error(f"Error processing agent task {task_id}: {str(e)}", exc_info=True)
        
        # Update task with error information
        await task_manager.update_task(task_id, {
            "status": "error",
            "error": str(e),
            "message": f"Error: {str(e)}",
            "progress": 0.0
        })

async def get_relevant_content(query: str, relevant_urls: List[str], app_state):
    """Get relevant content from knowledge graph."""
    # Use page service if available
    content = []
    
    if relevant_urls:
        # Use specified URLs
        for url in relevant_urls:
            # Try to get page from Neo4j
            if hasattr(app_state, "graph_service"):
                try:
                    page = await app_state.graph_service.get_page_by_url(url)
                    if page:
                        content.append({
                            "url": url,
                            "title": page.get("title", url.split("/")[-1]),
                            "content": page.get("content", ""),
                            "relevance": 0.95
                        })
                        continue
                except Exception as e:
                    logger.warning(f"Error fetching page {url}: {str(e)}")
            
            # Fallback: Use mock content based on URL
            filename = url.split("/")[-1]
            if "decisions" in url:
                content.append({
                    "url": url,
                    "title": "Architectural Decisions",
                    "content": "Browser Extension First: Develop Marvin as a browser extension from the start rather than beginning with a standalone application. Neo4j as Knowledge Graph Backend: Use Neo4j as the primary database for storing and managing the knowledge graph. LLM Provider Abstraction: Implement a provider-agnostic abstraction layer for LLM integration.",
                    "relevance": 0.95
                })
            elif "overview" in url:
                content.append({
                    "url": url,
                    "title": "System Overview", 
                    "content": "Marvin is an intelligent research assistant that actively helps users organize and leverage their browsing history and research materials. Core Components: Task Execution Engine, Knowledge Graph Manager, LLM Integration Service, Web Search Service.",
                    "relevance": 0.9
                })
            elif "api-docs" in url:
                content.append({
                    "url": url,
                    "title": "API Documentation",
                    "content": "The Marvin API provides endpoints for managing the knowledge graph, content analysis, and task execution. Authentication uses a Bearer token scheme. All endpoints return responses in a standardized format.",
                    "relevance": 0.85
                })
    else:
        # No URLs provided, search graph with query
        logger.info(f"No relevant URLs provided, searching with query: {query}")
        
        # Try to use graph service if available
        if hasattr(app_state, "graph_service"):
            try:
                results = await app_state.graph_service.query_pages(query, limit=3)
                for page in results:
                    content.append({
                        "url": page.get("url"),
                        "title": page.get("title", page.get("url", "").split("/")[-1]),
                        "content": page.get("content", ""),
                        "relevance": page.get("score", 0.7)
                    })
            except Exception as e:
                logger.warning(f"Error searching graph: {str(e)}")
                
        # Fallback: Add mock content based on query terms
        if not content:
            if "architecture" in query.lower() or "decisions" in query.lower():
                content.append({
                    "url": "https://raw.githubusercontent.com/touchthesun/marvin/refs/heads/main/docs/architecture/decisions.md",
                    "title": "Architectural Decisions",
                    "content": "Browser Extension First: Develop Marvin as a browser extension from the start rather than beginning with a standalone application. Neo4j as Knowledge Graph Backend: Use Neo4j as the primary database for storing and managing the knowledge graph.",
                    "relevance": 0.85
                })
            elif "components" in query.lower() or "overview" in query.lower():
                content.append({
                    "url": "https://raw.githubusercontent.com/touchthesun/marvin/refs/heads/main/docs/architecture/overview.md",
                    "title": "System Overview",
                    "content": "Marvin is an intelligent research assistant that actively helps users organize and leverage their browsing history and research materials. Core Components: Task Execution Engine, Knowledge Graph Manager, LLM Integration Service, Web Search Service.",
                    "relevance": 0.8
                })
            elif "api" in query.lower() or "documentation" in query.lower():
                content.append({
                    "url": "https://raw.githubusercontent.com/touchthesun/marvin/refs/heads/main/docs/api/api-docs.md",
                    "title": "API Documentation",
                    "content": "The Marvin API provides endpoints for managing the knowledge graph, content analysis, and task execution. Authentication uses a Bearer token scheme.",
                    "relevance": 0.75
                })
    
    return content

async def generate_llm_response(
    query: str, 
    content: List[dict], 
    task_type: AgentTaskType, 
    provider_id: Optional[str],
    model_id: Optional[str],
    app_state
):
    """Generate LLM response using the provided context and specified provider."""
    try:
        if not app_state.llm_factory:
            logger.warning("LLM factory not initialized, using mock response")
            return f"Mock response for query: {query}"
        
        # Use specified provider or fall back to default
        # Make it use the same provider_id that was configured in the test harness
        # if app_state.environment == "test":
        #     provider_id = provider_id or "anthropic-test"  # Use test ID in test environment
        # else:
        provider_id = provider_id or "anthropic"  # Use regular ID in production
        
        # Use specified model or fall back to provider-specific default
        default_models = {
            "anthropic": "claude-3-haiku-20240307",
            "ollama": "llama3",
            "openai": "gpt-3.5-turbo"
        }
        model_id = model_id or default_models.get(provider_id, "claude-3-haiku-20240307")
        
        # Format context for LLM
        context_text = "\n\n".join([
            f"Source: {item['url']}\nTitle: {item['title']}\nContent: {item['content']}"
            for item in content
        ])
        
        system_prompt = """You are Marvin, an intelligent research assistant. 
        Answer queries based on the provided context. 
        If the context doesn't contain relevant information, say so rather than making things up.
        Always cite your sources when referencing specific information."""
        
        user_prompt = f"Question: {query}\n\nContext:\n{context_text}"
        
        # Create a generic request that will be converted to provider-specific format
        
        generic_request = GenerationRequest(
            provider_id=provider_id,
            model_id=model_id,
            prompt=user_prompt,
            system_prompt=system_prompt,
            max_tokens=1000,
            temperature=0.7,
            stream=False
        )
        
        # Use the LLM route's helper function to convert to provider-specific request
        async with app_state.llm_factory.get_provider_context(provider_id, model_id) as provider:
            
            # Determine provider type from class name if provider_type attribute doesn't exist
            if hasattr(provider, "provider_type"):
                provider_type = provider.provider_type
            else:
                # Extract from class name (e.g., 'AnthropicProvider' -> 'anthropic')
                provider_class_name = provider.__class__.__name__
                provider_type = provider_class_name.replace('Provider', '').lower()
            
            provider_request = await _convert_to_provider_request(
                provider_type, generic_request
            )
            
            async for response in provider.generate(provider_request):
                return response.response
                
        # Fallback
        return f"No response generated for query: {query}"
            
    except Exception as e:
        logger.error(f"Error generating LLM response: {str(e)}", exc_info=True)
        return f"Error generating response: {str(e)}"