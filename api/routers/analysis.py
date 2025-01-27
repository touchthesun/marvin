from fastapi import APIRouter, Depends, HTTPException
from typing import Dict, Any
from ..dependencies import get_pipeline_service
from api.models.request import PageCreate
from api.models.response import TaskResponse

router = APIRouter(prefix="/analysis", tags=["analysis"])

@router.post("/analyze", response_model=TaskResponse)
async def analyze_page(
    page: PageCreate,
    pipeline_service = Depends(get_pipeline_service)
):
    result = await pipeline_service.enqueue_urls([str(page.url)])
    return TaskResponse(
        success=True,
        task_id=result["task_id"],
        status="enqueued",
        progress=0.0
    )

@router.get("/status/{task_id}", response_model=TaskResponse)
async def get_analysis_status(
    task_id: str,
    pipeline_service = Depends(get_pipeline_service)
):
    status = await pipeline_service.get_status(task_id)
    return TaskResponse(success=True, **status)