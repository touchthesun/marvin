from fastapi import APIRouter, Depends, HTTPException
from typing import Optional, List

from api.dependencies import get_page_service, get_validation_runner
from api.models.request import PageCreate, BatchPageCreate
from api.models.response import PageResponse, BatchPageResponse
from api.services.validation_service import ValidationLevel

from core.content.page import Page
from core.utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/pages", tags=["pages"])

@router.post("/", response_model=PageResponse)
async def create_page(
    page: PageCreate,
    page_service = Depends(get_page_service),
    validator = Depends(get_validation_runner)
):
    validation = await validator.validate_page(page, {ValidationLevel.API})
    if not validation.is_valid:
        raise HTTPException(
            status_code=422, 
            detail=[error.to_dict() for error in validation.errors]
        )
    
    result = await page_service.get_or_create_page(
        url=str(page.url),
        context=page.context,
        tab_id=page.tab_id,
        window_id=page.window_id,
        bookmark_id=page.bookmark_id
    )
    return PageResponse(success=True, **result.to_dict())

@router.post("/batch", response_model=BatchPageResponse)
async def create_pages(
    pages: BatchPageCreate,
    page_service = Depends(get_page_service)
):
    results = []
    errors = 0
    for page in pages.pages:
        try:
            result = await page_service.get_or_create_page(
                url=str(page.url),
                context=page.context,
                tab_id=page.tab_id,
                window_id=page.window_id,
                bookmark_id=page.bookmark_id
            )
            results.append(result)
        except Exception:
            errors += 1
    
    return BatchPageResponse(
        success=True,
        pages=[PageResponse(**p.to_dict()) for p in results],
        total_count=len(pages.pages),
        success_count=len(results),
        error_count=errors
    )

@router.get("/", response_model=BatchPageResponse)
async def query_pages(
    context: Optional[str] = None,
    status: Optional[str] = None,
    domain: Optional[str] = None,
    page_service = Depends(get_page_service)
) -> List[Page]:
    try:
        logger.info(f"Querying pages with status={status}, context={context}, domain={domain}")
        results = await page_service.query_pages(
            context=context,
            status=status,
            domain=domain
        )
        return BatchPageResponse(
            success=True,
            pages=[PageResponse(**p.to_dict()) for p in results],
            total_count=len(results),
            success_count=len(results),
            error_count=0
        )
    
    except Exception as e:
        logger.error(f"Error querying pages: {str(e)}", exc_info=True)
        raise

