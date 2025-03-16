import asyncio
from fastapi import APIRouter, Depends
from core.services.content.pipeline_service import PipelineService
from api.dependencies import get_pipeline_service
from api.models.page.request import PageCreate
from api.models.analysis.response import TaskResponseData, TaskResponse
from core.utils.logger import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/analysis", tags=["analysis"])


@router.post("/analyze", response_model=TaskResponse)
async def analyze_page(
    page: PageCreate,
    pipeline_service: PipelineService = Depends(get_pipeline_service)
) -> TaskResponse:
    """Submit a URL for analysis."""
    try:
        logger.info(f"Analyzing URL: {page.url} with context {page.context}")
        
        page_dict = {
            "url": str(page.url),
            "context": page.context
        }
        
        # Add optional fields if they exist
        for field in ['tab_id', 'window_id', 'bookmark_id']:
            if hasattr(page, field) and getattr(page, field) is not None:
                page_dict[field] = getattr(page, field)
        
        logger.debug(f"Submitting page dict to pipeline: {page_dict}")
        result = await pipeline_service.enqueue_urls([page_dict])
        
        if not result or "task_id" not in result:
            return TaskResponse(
                success=False,
                data=TaskResponseData(
                    success=False,
                    task_id="error",
                    status="error",
                    progress=0.0,
                    message="Failed to enqueue analysis task",
                    error="Invalid pipeline service response"
                )
            )
            
        return TaskResponse(
            success=True,
            data=TaskResponseData(
                success=True,
                task_id=result["task_id"],
                status="enqueued",
                progress=0.0,
                message="Task successfully enqueued"
            )
        )
    except Exception as e:
        logger.error(f"Error analyzing page: {str(e)}", exc_info=True)
        raise


@router.get("/status/{task_id}", response_model=TaskResponse)
async def get_analysis_status(
    task_id: str,
    pipeline_service = Depends(get_pipeline_service)
) -> TaskResponse:
    """Get the status of an analysis task."""
    try:
        logger.info(f"Checking status for task: {task_id}")
        
        # Replace asyncio.timeout with asyncio.wait_for for Python 3.9 compatibility
        try:
            status = await asyncio.wait_for(
                pipeline_service.get_status(task_id),
                timeout=5.0
            )
        except asyncio.TimeoutError:
            logger.error(f"Timeout retrieving status for task: {task_id}")
            return TaskResponse(
                success=False,
                data=TaskResponseData(
                    success=False,
                    task_id=task_id,
                    status="error",
                    progress=0.0,
                    message="Status check timed out",
                    error="Endpoint timeout retrieving task status"
                )
            )
            
        logger.debug(f"Raw status response: {status}")
        
        if not status or status.get("status") == "not_found":
            msg = f"Task {task_id} not found"
            logger.warning(msg)
            return TaskResponse(
                success=False,
                data=TaskResponseData(
                    success=False,
                    task_id=task_id,
                    status="error",
                    progress=0.0,
                    message=msg,
                    error="Task not found"
                )
            )
        
        # Extract error message if status is error
        error_msg = None
        if status.get("status") == "error":
            error_msg = status.get("error", "Unknown error occurred")
            logger.error(f"Task {task_id} failed: {error_msg}")
            
        return TaskResponse(
            success=status.get("status") not in ["error", "not_found"],
            data=TaskResponseData(
                success=status.get("status") not in ["error", "not_found"],
                task_id=task_id,
                status=status.get("status", "unknown"),
                progress=float(status.get("progress", 0.0)),
                message=status.get("message", f"Task is {status.get('status', 'unknown')}"),
                error=error_msg
            )
        )
        
    except Exception as e:
        logger.error(f"Error checking task status {task_id}: {str(e)}")
        return TaskResponse(
            success=False,
            data=TaskResponseData(
                success=False,
                task_id=task_id,
                status="error",
                progress=0.0,
                message="Status check failed",
                error=str(e)
            )
        )
    
@router.post("/test", response_model=TaskResponse)
async def test_analyze(
    page: PageCreate,
    pipeline_service: PipelineService = Depends(get_pipeline_service)
) -> TaskResponse:
    """Minimal test endpoint for diagnosis."""
    try:
        logger.info(f"Test analyze endpoint called for URL: {page.url}")
        
        # Create task ID
        from uuid import uuid4
        from datetime import datetime
        
        task_id = str(uuid4())
        url = str(page.url)
        
        # Store directly in processed_urls with success status
        pipeline_service.processed_urls[url] = {
            "url": url,
            "status": "completed",  # Mark as completed immediately
            "task_id": task_id,
            "progress": 1.0,
            "queued_at": datetime.now().isoformat(),
            "completed_at": datetime.now().isoformat(),
            "browser_context": page.context.value if page.context else None,
            "tab_id": getattr(page, "tab_id", None),
            "window_id": getattr(page, "window_id", None),
            "bookmark_id": getattr(page, "bookmark_id", None),
            "message": "Test task completed successfully"
        }
        
        logger.info(f"Created test task {task_id} for {url} with completed status")
        
        # Return success response
        return TaskResponse(
            success=True,
            data=TaskResponseData(
                success=True,
                task_id=task_id,
                status="completed",
                progress=1.0,
                message="Test task completed"
            )
        )
    except Exception as e:
        logger.error(f"Error in test endpoint: {str(e)}", exc_info=True)
        return TaskResponse(
            success=False,
            data=TaskResponseData(
                success=False,
                task_id="error",
                status="error",
                progress=0.0,
                message="Test failed",
                error=str(e)
            )
        )