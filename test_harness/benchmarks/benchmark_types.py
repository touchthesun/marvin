from datetime import datetime
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field

@dataclass
class PipelineMetrics:
    """Tracks pipeline-specific performance metrics."""
    stage_times: Dict[str, float] = field(default_factory=dict)
    component_times: Dict[str, float] = field(default_factory=dict)
    total_components: int = 0
    stage_sequence: List[str] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)

class BenchmarkResult:
    """Container for benchmark test results.
    
    Stores both page-specific data and pipeline metrics from processing.
    """
    
    def __init__(self, page_path: str):
        # Basic information
        self.page_path = page_path
        self.timestamp = datetime.now()
        self.final_status: str = "unknown"
        
        # Content metrics
        self.content_length: int = 0
        self.processing_time: float = 0
        
        # Metadata metrics
        self.metadata_quality: float = 0.0
        self.metadata_fields: List[str] = []
        
        # Keyword metrics
        self.keyword_count: int = 0
        self.keywords: List[Dict[str, Any]] = []
        
        # Relationship metrics
        self.relationships: List[Dict[str, Any]] = []

        # Pipeline metrics
        self.pipeline_metrics: Optional[Dict] = None

        # Add Page object details
        self.page_object: Optional[Dict[str, Any]] = None
        
        # Error tracking
        self.errors: List[str] = []

    def to_dict(self) -> Dict[str, Any]:
        """Convert results to dictionary format."""
        pipeline_metrics = self.pipeline_metrics or {}
        result_dict = {
            'page_path': self.page_path,
            'timestamp': self.timestamp.isoformat(),
            'final_status': self.final_status,
            
            'content_metrics': {
                'length': self.content_length,
                'processing_time': self.processing_time
            },
            
            'metadata_metrics': {
                'quality_score': self.metadata_quality,
                'fields_present': self.metadata_fields
            },
            
            'keyword_metrics': {
                'count': self.keyword_count,
                'keywords': self.keywords
            },
            'relationship_metrics': {
                'count': len(self.relationships),
                'relationships': self.relationships
            },
            
            'pipeline_metrics': {
                'stage_times': pipeline_metrics.get('stage_times', {}),
                'component_times': pipeline_metrics.get('component_times', {}),
                'total_components': pipeline_metrics.get('total_components', 0),
                'stage_sequence': pipeline_metrics.get('stage_sequence', []),
                'errors': pipeline_metrics.get('errors', [])
            } if self.pipeline_metrics else {},
            
            'errors': self.errors
        }
        
        # Add Page object details if available
        if self.page_object is not None:
            result_dict['page_object'] = self.page_object
        
        return result_dict

    @staticmethod
    def from_dict(data: Dict[str, Any]) -> 'BenchmarkResult':
        """Create a BenchmarkResult from dictionary data."""
        result = BenchmarkResult(data['page_path'])
        result.timestamp = datetime.fromisoformat(data['timestamp'])
        result.final_status = data['final_status']
        
        # Content metrics
        content_metrics = data.get('content_metrics', {})
        result.content_length = content_metrics.get('length', 0)
        result.processing_time = content_metrics.get('processing_time', 0)
        
        # Metadata metrics
        metadata_metrics = data.get('metadata_metrics', {})
        result.metadata_quality = metadata_metrics.get('quality_score', 0)
        result.metadata_fields = metadata_metrics.get('fields_present', [])
        
        # Keyword metrics
        keyword_metrics = data.get('keyword_metrics', {})
        result.keyword_count = keyword_metrics.get('count', 0)
        result.keywords = keyword_metrics.get('keywords', [])

        # Relationship metrics
        relationship_metrics = data.get('relationship_metrics', {})
        result.relationship_count = relationship_metrics.get('count', 0)
        result.relationships = relationship_metrics.get('relationships', [])

        # Restore Page object details
        if 'page_object' in data:
            result.page_object = data['page_object']
        
        # Pipeline metrics
        pipeline_data = data.get('pipeline_metrics', {})
        if pipeline_data:
            result.pipeline_metrics = PipelineMetrics(
                stage_times=pipeline_data.get('stage_times', {}),
                component_times=pipeline_data.get('component_times', {}),
                total_components=pipeline_data.get('total_components', 0),
                stage_sequence=pipeline_data.get('stage_sequence', []),
                errors=pipeline_data.get('errors', [])
            )
        
        result.errors = data.get('errors', [])
        return result

    def get_total_pipeline_time(self) -> float:
        """Calculate total time spent in pipeline stages."""
        if not self.pipeline_metrics:
            return 0.0
        return sum(self.pipeline_metrics.stage_times.values())

    def get_pipeline_efficiency(self) -> float:
        """Calculate pipeline efficiency (processing time / total pipeline time)."""
        total_time = self.get_total_pipeline_time()
        if not total_time:
            return 0.0
        return self.processing_time / total_time

    def add_pipeline_error(self, error: str) -> None:
        """Add a pipeline-specific error."""
        if not self.pipeline_metrics:
            self.pipeline_metrics = PipelineMetrics()
        self.pipeline_metrics.errors.append(error)
        self.errors.append(f"Pipeline error: {error}")

    def add_metadata_field(self, field: str) -> None:
        """Track a successfully extracted metadata field."""
        if field not in self.metadata_fields:
            self.metadata_fields.append(field)