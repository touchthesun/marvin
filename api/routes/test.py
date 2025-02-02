from fastapi import APIRouter, Depends, HTTPException
from typing import List, Dict, Any
from pydantic import BaseModel, HttpUrl

from core.services.content.pipeline_service import PipelineService
from api.dependencies import get_pipeline_service
from core.utils.logger import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/test", tags=["test"])

class URLSubmission(BaseModel):
    """Model for URL submission"""
    url: HttpUrl

class URLBatchSubmission(BaseModel):
    """Model for batch URL submission"""
    urls: List[HttpUrl]

@router.post("/submit")
async def submit_url(
    submission: URLSubmission,
    service: PipelineService = Depends(get_pipeline_service)
) -> Dict[str, Any]:
    """Test endpoint for submitting a single URL."""
    try:
        logger.info(f"Test submission received for URL: {submission.url}")
        result = await service.enqueue_url(str(submission.url))
        return {
            "status": "success",
            "message": "URL submitted for processing",
            "data": result
        }
    except Exception as e:
        logger.error(f"Error in test submission: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/submit/batch")
async def submit_urls(
    submission: URLBatchSubmission,
    service: PipelineService = Depends(get_pipeline_service)
) -> Dict[str, Any]:
    """Test endpoint for submitting multiple URLs."""
    try:
        logger.info(f"Test batch submission received for {len(submission.urls)} URLs")
        result = await service.enqueue_urls([str(url) for url in submission.urls])
        return {
            "status": "success",
            "message": "URLs submitted for processing",
            "data": result
        }
    except Exception as e:
        logger.error(f"Error in test batch submission: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/status/{url:path}")
async def check_status(
    url: str,
    service: PipelineService = Depends(get_pipeline_service)
) -> Dict[str, Any]:
    """Test endpoint for checking URL processing status."""
    try:
        logger.info(f"Status check requested for URL: {url}")
        status = await service.get_status(url)
        return {
            "status": "success",
            "data": status
        }
    except Exception as e:
        logger.error(f"Error checking status: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/queue")
async def get_queue_status(
    service: PipelineService = Depends(get_pipeline_service)
) -> Dict[str, Any]:
    """Test endpoint for checking queue status."""
    try:
        return {
            "status": "success",
            "data": {
                "queue_size": service.url_queue.qsize(),
                "active_tasks": len(service.active_tasks),
                "max_concurrent": service.max_concurrent
            }
        }
    except Exception as e:
        logger.error(f"Error getting queue status: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))