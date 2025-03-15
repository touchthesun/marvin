import time
from core.utils.logger import get_logger


class DatabaseMetrics:
    def __init__(self):
        self.start_time = time.time()
        self.operation_type = None
        
    def start_operation(self, op_type: str) -> 'DatabaseMetrics':
        self.operation_type = op_type
        self.start_time = time.time()
        return self
        
    def record_success(self, result_count: int):
        duration = time.time() - self.start_time
        get_logger(__name__).info(
            f"Query succeeded",
            extra={
                "operation": self.operation_type,
                "duration": duration,
                "result_count": result_count
            }
        )
        
    def record_timeout(self):
        duration = time.time() - self.start_time
        get_logger(__name__).warning(
            f"Query timed out",
            extra={
                "operation": self.operation_type,
                "duration": duration
            }
        )
        
    def record_error(self, error: str):
        duration = time.time() - self.start_time
        get_logger(__name__).error(
            f"Query failed",
            extra={
                "operation": self.operation_type,
                "duration": duration,
                "error": error
            }
        )