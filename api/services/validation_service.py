from dataclasses import dataclass
from typing import List, Optional, Set, Dict, Any
from enum import Enum
from urllib.parse import urlparse
from core.content.page import Page, PageStatus, BrowserContext, RelationType

class ValidationLevel(Enum):
    """Levels at which validation can occur"""
    API = "api"
    SERVICE = "service"
    DATABASE = "database"

class ValidationType(Enum):
    """Types of validation to perform"""
    URL = "url"
    PAGE_STATE = "page_state"
    RELATIONSHIP = "relationship"
    SCHEMA = "schema"

@dataclass
class ValidationError:
    level: ValidationLevel
    type: ValidationType
    message: str
    details: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "level": self.level.value,
            "type": self.type.value,
            "message": self.message,
            "details": self.details
        }



class ValidationResult:
    """Holds the results of validation operations"""
    
    def __init__(self):
        self.errors: List[ValidationError] = []
        self.warnings: List[ValidationError] = []
    
    @property
    def is_valid(self) -> bool:
        return len(self.errors) == 0
    
    def add_error(self, level: ValidationLevel, type: ValidationType, 
                  message: str, details: Optional[Dict[str, Any]] = None):
        self.errors.append(ValidationError(level, type, message, details))
    
    def add_warning(self, level: ValidationLevel, type: ValidationType,
                    message: str, details: Optional[Dict[str, Any]] = None):
        self.warnings.append(ValidationError(level, type, message, details))

class ValidationRunner:
    """Coordinates validation across different layers and types"""
    
    def __init__(self):
        self.url_validator = URLValidator()
        self.state_validator = PageStateValidator()
        self.relationship_validator = RelationshipValidator()
        self.schema_validator = SchemaValidator()
    
    async def validate_page(self, page: Page, levels: Set[ValidationLevel]) -> ValidationResult:
        """Validate a page at specified levels"""
        result = ValidationResult()
        
        for level in levels:
            # URL validation
            url_result = await self.url_validator.validate(page.url, level)
            result.errors.extend(url_result.errors)
            result.warnings.extend(url_result.warnings)
            
            # State validation
            state_result = await self.state_validator.validate(page, level)
            result.errors.extend(state_result.errors)
            result.warnings.extend(state_result.warnings)
            
            # Schema validation if at database level
            if level == ValidationLevel.DATABASE:
                schema_result = await self.schema_validator.validate(page, level)
                result.errors.extend(schema_result.errors)
                result.warnings.extend(schema_result.warnings)
        
        return result
    
    async def validate_relationship(self, source_page: Page, target_page: Page,
                                  rel_type: RelationType) -> ValidationResult:
        """Validate a relationship between pages"""
        return await self.relationship_validator.validate(source_page, target_page, rel_type)

class BaseValidator:
    """Base class for validators"""
    
    async def validate(self, *args, **kwargs) -> ValidationResult:
        raise NotImplementedError()

class URLValidator(BaseValidator):
    """Validates URLs at different levels"""
    
    ALLOWED_SCHEMES = {'http', 'https', 'chrome', 'edge', 'firefox', 'brave', 'file'}
    MAX_URL_LENGTH = 2048
    
    async def validate(self, url: str, level: ValidationLevel) -> ValidationResult:
        result = ValidationResult()
        
        try:
            url_str = str(url)
            parsed = urlparse(url_str)
            
            # Basic URL format validation
            if not parsed.scheme or not parsed.netloc:
                result.add_error(level, ValidationType.URL,
                               f"Invalid URL format: {url}")
                return result
            
            # Scheme validation
            if parsed.scheme not in self.ALLOWED_SCHEMES:
                result.add_error(level, ValidationType.URL,
                               f"Invalid URL scheme: {parsed.scheme}")
            
            # Length validation
            if len(url) > self.MAX_URL_LENGTH:
                result.add_error(level, ValidationType.URL,
                               f"URL exceeds maximum length of {self.MAX_URL_LENGTH}")
            
            # Additional API-level validation
            if level == ValidationLevel.API:
                # Add any API-specific URL validation
                pass
                
            # Additional service-level validation
            elif level == ValidationLevel.SERVICE:
                # Add any service-specific URL validation
                pass
                
            # Additional database-level validation
            elif level == ValidationLevel.DATABASE:
                # Add any database-specific URL validation
                pass
                
        except Exception as e:
            result.add_error(level, ValidationType.URL,
                           f"URL validation error: {str(e)}")
        
        return result

class PageStateValidator(BaseValidator):
    """Validates page states and transitions"""
    
    # Define valid state transitions
    VALID_TRANSITIONS = {
        PageStatus.DISCOVERED: {PageStatus.IN_PROGRESS, PageStatus.ERROR},
        PageStatus.IN_PROGRESS: {PageStatus.ACTIVE, PageStatus.ERROR},
        PageStatus.ACTIVE: {PageStatus.HISTORY, PageStatus.ERROR},
        PageStatus.HISTORY: {PageStatus.ACTIVE},
        PageStatus.ERROR: {PageStatus.DISCOVERED}
    }
    
    async def validate(self, page: Page, level: ValidationLevel) -> ValidationResult:
        result = ValidationResult()
        
        # Validate state transitions
        if hasattr(page, '_previous_status') and page.status != page._previous_status:
            if page._previous_status not in self.VALID_TRANSITIONS or \
               page.status not in self.VALID_TRANSITIONS[page._previous_status]:
                result.add_error(
                    level,
                    ValidationType.PAGE_STATE,
                    f"Invalid state transition: {page._previous_status} -> {page.status}"
                )
        
        # Validate context combinations
        contexts = page.browser_contexts
        if BrowserContext.HISTORY in contexts:
            active_contexts = {BrowserContext.ACTIVE_TAB, BrowserContext.OPEN_TAB}
            if any(c in contexts for c in active_contexts):
                result.add_error(
                    level,
                    ValidationType.PAGE_STATE,
                    "Page cannot be both HISTORY and active/open"
                )
        
        return result

class RelationshipValidator(BaseValidator):
    """Validates relationships between pages"""
    
    async def validate(self, source_page: Page, target_page: Page,
                      rel_type: RelationType) -> ValidationResult:
        result = ValidationResult()
        
        # Validate self-relationships
        if source_page.id == target_page.id:
            result.add_error(
                ValidationLevel.SERVICE,
                ValidationType.RELATIONSHIP,
                "Self-relationships are not allowed"
            )
        
        # Validate relationship logic
        if rel_type == RelationType.PRECEDES:
            # Check for circular precedence
            if any(r.relation_type == RelationType.PRECEDES and 
                  r.target_id == source_page.id for r in target_page.relationships):
                result.add_error(
                    ValidationLevel.SERVICE,
                    ValidationType.RELATIONSHIP,
                    "Circular precedence relationships are not allowed"
                )
        
        return result

class SchemaValidator(BaseValidator):
    """Validates database schema compliance"""
    
    async def validate(self, page: Page, level: ValidationLevel) -> ValidationResult:
        result = ValidationResult()
        
        # Validate required fields
        if not page.url or not page.domain:
            result.add_error(
                level,
                ValidationType.SCHEMA,
                "Missing required fields: url and domain"
            )
        
        # Validate data types
        if not isinstance(page.browser_contexts, set):
            result.add_error(
                level,
                ValidationType.SCHEMA,
                "browser_contexts must be a set"
            )
        
        return result