from fastapi import APIRouter, Depends, HTTPException
from typing import Optional
from datetime import datetime
from core.infrastructure.database.transactions import Transaction

from core.services.content.page_service import PageService
from core.services.validation_service import ValidationRunner, ValidationLevel
from api.dependencies import get_page_service, get_validation_runner
from api.models.page.request import PageCreate, BatchPageCreate
from api.models.page.response import PageData, PageMetrics, BatchPageData, PageResponse, BatchPageResponse


from core.domain.content.models.page import Page
from core.utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/pages", tags=["pages"])


def create_page_data(page: Page) -> PageData:
    """Convert a Page domain object to PageData API model."""
    metrics_data = {
        'quality_score': page.metadata.metrics.quality_score,
        'relevance_score': page.metadata.metrics.relevance_score,
        'last_visited': page.metadata.metrics.last_visited,
        'visit_count': page.metadata.metrics.visit_count,
        'processing_time': page.metadata.metrics.processing_time,
        'keyword_count': page.metadata.metrics.keyword_count
    }
    
    return PageData(
        id=page.id,
        url=page.url,
        domain=page.domain,
        title=page.title,
        status=page.status,
        keywords=page.keywords or {},
        relationships=page.relationships or [],
        discovered_at=page.metadata.discovered_at,
        processed_at=getattr(page.metadata, 'processed_at', None),
        updated_at=getattr(page.metadata, 'updated_at', None),
        browser_contexts=page.metadata.browser_contexts,
        tab_id=page.metadata.tab_id,
        window_id=page.metadata.window_id,
        bookmark_id=page.metadata.bookmark_id,
        last_active=getattr(page.metadata, 'last_active', None),
        metrics=PageMetrics(**metrics_data),
        metadata={
            k: v for k, v in page.metadata.to_dict().items()
            if k not in {
                'discovered_at', 'processed_at', 'updated_at',
                'browser_contexts', 'tab_id', 'window_id',
                'bookmark_id', 'last_active', 'metrics'
            }
        }
    )


@router.post("/", response_model=PageResponse)
async def create_page(
    page: PageCreate,
    page_service: PageService = Depends(get_page_service),
    validator: ValidationRunner = Depends(get_validation_runner)
):
    """Create a new page."""
    tx = Transaction()
    try:
        # Validate at API level
        validation = await validator.validate_page(
            page, 
            levels={ValidationLevel.API}
        )
        
        if not validation.is_valid:
            raise HTTPException(
                status_code=422, 
                detail=[error.to_dict() for error in validation.errors]
            )
        
        # Create page within transaction
        result = await page_service.get_or_create_page(
            tx=tx,
            url=str(page.url),
            context=page.context,
            tab_id=page.tab_id,
            window_id=page.window_id,
            bookmark_id=page.bookmark_id
        )
        
        # Commit transaction
        await tx.commit()
        
        # Convert to API response
        page_data = create_page_data(result)
        return PageResponse(
            success=True,
            data=page_data,
            error=None,
            metadata={"timestamp": datetime.now().isoformat()}
        )
    except Exception as e:
        # Ensure rollback on any error
        await tx.rollback()
        logger.error(f"Error creating page: {str(e)}", exc_info=True)
        raise


@router.post("/batch", response_model=BatchPageResponse)
async def create_pages(
    pages: BatchPageCreate,
    page_service = Depends(get_page_service)
):
    """Create multiple pages in a batch."""
    tx = Transaction()
    try:
        page_data_list = []
        errors = 0
        
        for page in pages.pages:
            try:
                result = await page_service.get_or_create_page(
                    tx=tx,
                    url=str(page.url),
                    context=page.context,
                    tab_id=page.tab_id,
                    window_id=page.window_id,
                    bookmark_id=page.bookmark_id
                )
                page_data_list.append(create_page_data(result))
                
            except Exception as e:
                logger.error(f"Error creating page {page.url}: {str(e)}")
                errors += 1
        
        await tx.commit()
        
        # Create batch response
        batch_data = BatchPageData(
            pages=page_data_list,
            total_count=len(pages.pages),
            success_count=len(page_data_list),
            error_count=errors
        )
        
        return BatchPageResponse(
            success=True,
            data=batch_data,
            error=None,
            metadata={"timestamp": datetime.now().isoformat()}
        )
        
    except Exception as e:
        await tx.rollback()
        logger.error(f"Error in batch page creation: {str(e)}", exc_info=True)
        raise


@router.get("/", response_model=BatchPageResponse)
async def query_pages(
    context: Optional[str] = None,
    status: Optional[str] = None,
    domain: Optional[str] = None,
    page_service = Depends(get_page_service)
) -> BatchPageResponse:
    try:
        logger.info(f"Querying pages with status={status}, context={context}, domain={domain}")
        tx = Transaction()
        try:
            results = await page_service.query_pages(
                tx=tx,
                context=context,
                status=status,
                domain=domain
            )
            await tx.commit()
            
            logger.debug(f"Query returned {len(results)} results")
            
            # Create PageData objects first
            page_data_list = []
            for p in results:
                logger.debug(f"Processing page {p.url}")
                # Convert metrics to dict format
                metrics_data = {
                    'quality_score': p.metadata.metrics.quality_score,
                    'relevance_score': p.metadata.metrics.relevance_score,
                    'last_visited': p.metadata.metrics.last_visited,
                    'visit_count': p.metadata.metrics.visit_count,
                    'processing_time': p.metadata.metrics.processing_time,
                    'keyword_count': p.metadata.metrics.keyword_count
                }
                
                logger.debug(f"Metrics data: {metrics_data}")
                
                # Create PageData object
                page_data = PageData(
                    id=p.id,
                    url=p.url,
                    domain=p.domain,
                    title=p.title,
                    status=p.status,
                    keywords=p.keywords or {},
                    relationships=p.relationships or [],
                    discovered_at=p.metadata.discovered_at,
                    processed_at=getattr(p.metadata, 'processed_at', None),
                    updated_at=getattr(p.metadata, 'updated_at', None),
                    browser_contexts=p.metadata.browser_contexts,
                    tab_id=p.metadata.tab_id,
                    window_id=p.metadata.window_id,
                    bookmark_id=p.metadata.bookmark_id,
                    last_active=getattr(p.metadata, 'last_active', None),
                    metrics=PageMetrics(**metrics_data),
                    metadata={
                        k: v for k, v in p.metadata.to_dict().items()
                        if k not in {
                            'discovered_at', 'processed_at', 'updated_at',
                            'browser_contexts', 'tab_id', 'window_id',
                            'bookmark_id', 'last_active', 'metrics'
                        }
                    }
                )
                page_data_list.append(page_data)
                
            # Create BatchPageData
            batch_data = BatchPageData(
                pages=page_data_list,
                total_count=len(results),
                success_count=len(results),
                error_count=0
            )
            
            # Create final response
            response = BatchPageResponse(
                success=True,
                data=batch_data,  # This is the key change
                error=None,
                metadata={"timestamp": datetime.now().isoformat()}
            )
            
            logger.debug(f"Created batch response with {len(page_data_list)} pages")
            return response
            
        except Exception as e:
            await tx.rollback()
            raise
    except Exception as e:
        logger.error(f"Error querying pages: {str(e)}", exc_info=True)
        raise