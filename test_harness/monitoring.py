import time
import statistics
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field

from core.utils.logger import get_logger

@dataclass
class TimerMetric:
    """Data class for timer metrics."""
    count: int = 0
    total_time: float = 0.0
    min_time: float = float('inf')
    max_time: float = 0.0
    values: List[float] = field(default_factory=list)
    
    @property
    def avg_time(self) -> float:
        """Calculate average time."""
        return self.total_time / self.count if self.count > 0 else 0.0
    
    @property
    def median_time(self) -> float:
        """Calculate median time."""
        return statistics.median(self.values) if self.values else 0.0

@dataclass
class ValueMetric:
    """Data class for value-based metrics."""
    count: int = 0
    values: List[Any] = field(default_factory=list)
    
    @property
    def avg_value(self) -> float:
        """Calculate average value for numeric metrics."""
        if not self.values or not all(isinstance(v, (int, float)) for v in self.values):
            return 0.0
        return sum(self.values) / len(self.values)
    
    @property
    def min_value(self) -> Any:
        """Get minimum value for comparable metrics."""
        return min(self.values) if self.values else None
    
    @property
    def max_value(self) -> Any:
        """Get maximum value for comparable metrics."""
        return max(self.values) if self.values else None

class PerformanceMonitor:
    """
    Monitors and records performance metrics during test execution.
    """
    
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize the performance monitor.
        
        Args:
            config: Test configuration
        """
        self.config = config
        self.logger = get_logger("test.performance", config.get("log_level"))
        self.timer_metrics: Dict[str, TimerMetric] = {}
        self.value_metrics: Dict[str, ValueMetric] = {}
        self.start_times: Dict[str, float] = {}
        self.running = False
        self.start_time = 0.0
    
    def start(self):
        """Start the performance monitoring session."""
        self.running = True
        self.start_time = time.time()
        self.logger.info("Performance monitoring started")
    
    def stop(self) -> Dict[str, Any]:
        """
        Stop the performance monitoring session and return metrics.
        
        Returns:
            Dictionary of collected metrics
        """
        end_time = time.time()
        self.running = False
        
        # Record total test duration
        self.record_metric("test_duration", end_time - self.start_time)
        
        self.logger.info("Performance monitoring stopped")
        return self.get_metrics()
    
    def start_timer(self, name: str) -> str:
        """
        Start a timer for a named operation.
        
        Args:
            name: Timer name
            
        Returns:
            Timer name for reference
        """
        if not self.running:
            self.logger.warning("Performance monitor not running, starting timer anyway")
            
        self.start_times[name] = time.time()
        return name
    
    def end_timer(self, name: str) -> Optional[float]:
        """
        End a timer and record the duration.
        
        Args:
            name: Timer name from start_timer()
            
        Returns:
            Duration in seconds, or None if timer not found
        """
        if name not in self.start_times:
            self.logger.warning(f"Timer '{name}' not found")
            return None
            
        duration = time.time() - self.start_times[name]
        
        # Initialize metric if needed
        if name not in self.timer_metrics:
            self.timer_metrics[name] = TimerMetric()
        
        # Update metric
        self.timer_metrics[name].count += 1
        self.timer_metrics[name].total_time += duration
        self.timer_metrics[name].min_time = min(self.timer_metrics[name].min_time, duration)
        self.timer_metrics[name].max_time = max(self.timer_metrics[name].max_time, duration)
        self.timer_metrics[name].values.append(duration)
        
        # Clean up start time
        del self.start_times[name]
        
        return duration
    
    def record_metric(self, name: str, value: Any):
        """
        Record a custom metric.
        
        Args:
            name: Metric name
            value: Metric value
        """
        if not self.running:
            self.logger.warning("Performance monitor not running, recording metric anyway")
            
        # Initialize metric if needed
        if name not in self.value_metrics:
            self.value_metrics[name] = ValueMetric()
        
        # Update metric
        self.value_metrics[name].count += 1
        self.value_metrics[name].values.append(value)
    
    def get_metrics(self) -> Dict[str, Any]:
        """
        Get a dictionary of all recorded metrics.
        
        Returns: Dictionary of metrics with statistics
        """
        metrics = {
            "timers": {},
            "values": {}
        }
        
        # Process timer metrics
        for name, metric in self.timer_metrics.items():
            metrics["timers"][name] = {
                "count": metric.count,
                "avg_time": metric.avg_time,
                "median_time": metric.median_time,
                "min_time": metric.min_time,
                "max_time": metric.max_time,
                "total_time": metric.total_time
            }
        
        # Process value metrics
        for name, metric in self.value_metrics.items():
            # Only include statistical calculations for numeric values
            if all(isinstance(v, (int, float)) for v in metric.values):
                metrics["values"][name] = {
                    "count": metric.count,
                    "avg_value": metric.avg_value,
                    "min_value": metric.min_value,
                    "max_value": metric.max_value
                }
                
                # Include standard deviation for numeric metrics
                if len(metric.values) > 1:
                    metrics["values"][name]["std_dev"] = statistics.stdev(metric.values)
            else:
                # For non-numeric metrics, just include the count
                metrics["values"][name] = {
                    "count": metric.count
                }
        
        # Add overall metrics
        metrics["overall"] = {
            "total_timers": len(self.timer_metrics),
            "total_value_metrics": len(self.value_metrics),
            "test_duration": self._get_test_duration()
        }
        
        return metrics
    

    def _get_test_duration(self) -> float:
        """Get the total test duration in seconds."""
        if not self.running:
            # If we've already stopped, get from value metrics
            if "test_duration" in self.value_metrics and self.value_metrics["test_duration"].values:
                return self.value_metrics["test_duration"].values[-1]
            return 0.0
        
        # If still running, calculate current duration
        return time.time() - self.start_time
    
    def reset(self):
        """Reset all metrics."""
        self.timer_metrics = {}
        self.value_metrics = {}
        self.start_times = {}
        if self.running:
            self.start_time = time.time()