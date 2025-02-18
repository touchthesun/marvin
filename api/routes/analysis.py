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
        status = await pipeline_service.get_status(task_id)
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