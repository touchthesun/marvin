from typing import Dict, Any, Optional, List
from dataclasses import dataclass, field


@dataclass
class Assertion:
    """
    Represents a test assertion with success/failure status and description.
    """
    name: str
    success: bool
    description: str
    details: Dict[str, Any] = field(default_factory=dict)
    
    def __str__(self) -> str:
        """String representation of the assertion."""
        status = "PASS" if self.success else "FAIL"
        return f"{status}: {self.name} - {self.description}"
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert assertion to dictionary for reporting."""
        return {
            "name": self.name,
            "success": self.success,
            "description": self.description,
            "details": self.details
        }

class AssertionGroup:
    """
    Groups related assertions together.
    """
    
    def __init__(self, name: str, description: Optional[str] = None):
        """
        Initialize an assertion group.
        
        Args:
            name: Group name
            description: Optional description
        """
        self.name = name
        self.description = description
        self.assertions: List[Assertion] = []
    
    def add(self, assertion: Assertion):
        """
        Add an assertion to the group.
        
        Args:
            assertion: Assertion to add
        """
        self.assertions.append(assertion)
    
    def create_and_add(self, name: str, condition: bool, description: str, 
                      details: Optional[Dict[str, Any]] = None) -> Assertion:
        """
        Create an assertion and add it to the group.
        
        Args:
            name: Assertion name
            condition: Boolean condition (True for pass, False for fail)
            description: Human-readable description
            details: Optional assertion details
            
        Returns:
            Created assertion
        """
        assertion = Assertion(
            name=name,
            success=condition,
            description=description,
            details=details or {}
        )
        self.add(assertion)
        return assertion
    
    @property
    def success(self) -> bool:
        """Check if all assertions in the group passed."""
        return all(a.success for a in self.assertions)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert assertion group to dictionary for reporting."""
        return {
            "name": self.name,
            "description": self.description,
            "success": self.success,
            "assertions": [a.to_dict() for a in self.assertions],
            "count": len(self.assertions),
            "passed": sum(1 for a in self.assertions if a.success)
        }