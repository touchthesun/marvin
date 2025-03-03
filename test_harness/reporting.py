import os
import json
import asyncio
import datetime
import traceback
from pathlib import Path
from typing import Dict, List, Any, Optional

from core.utils.logger import get_logger

class TestReporter:
    """
    Generates test reports from test results and performance metrics.
    """
    
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize the test reporter.
        
        Args:
            config: Test configuration
        """
        self.config = config
        self.logger = get_logger("test.reporter", config.get("log_level"))
        self.results = []
        self.metrics = {}
        
        self.logger.debug("Test reporter initialized")
        report_dir = self.config.get("reporting", {}).get("report_dir", "reports")
        self.logger.debug(f"Report directory: {report_dir}")
    
    def add_results(self, results: List[Dict[str, Any]]):
        """
        Add test results to the reporter.
        
        Args:
            results: List of test result dictionaries
        """
        self.logger.info(f"Adding {len(results)} test results to reporter")
        self.results.extend(results)
        
        # Log summary of added results
        passed = sum(1 for r in results if r.get("success", False))
        self.logger.debug(f"Results added: {passed}/{len(results)} passed")
    
    def add_result(self, result: Dict[str, Any]):
        """
        Add a single test result to the reporter.
        
        Args:
            result: Test result dictionary
        """
        scenario = result.get("scenario", "unknown")
        success = result.get("success", False)
        self.logger.info(f"Adding result for scenario '{scenario}': {'SUCCESS' if success else 'FAILURE'}")
        self.results.append(result)
    
    def add_metrics(self, metrics: Dict[str, Any]):
        """
        Add performance metrics to the reporter.
        
        Args:
            metrics: Dictionary of performance metrics
        """
        self.logger.info("Adding performance metrics to reporter")
        self.metrics = metrics
        
        # Log summary of metrics
        timer_count = len(metrics.get("timers", {}))
        value_count = len(metrics.get("values", {}))
        self.logger.debug(f"Added {timer_count} timer metrics and {value_count} value metrics")
    
    

    def generate_summary(self) -> Dict[str, Any]:
        """
        Generate a summary of the test results.
        
        Returns:
            Summary dictionary
        """
        self.logger.info("Generating test results summary")
        
        try:
            total = len(self.results)
            passed = sum(1 for r in self.results if r.get("success", False))
            failed = total - passed
            
            summary = {
                "total": total,
                "passed": passed,
                "failed": failed,
                "success_rate": f"{(passed / total * 100) if total > 0 else 0:.2f}%",
                "timestamp": datetime.datetime.now().isoformat()
            }
            
            # Add details for each scenario
            summary["scenarios"] = {}
            for result in self.results:
                scenario_name = result.get("scenario", "unknown")
                summary["scenarios"][scenario_name] = {
                    "success": result.get("success", False),
                    "execution_time": result.get("execution_time", 0.0),
                    "assertions": {}
                }
                
                # Add assertion details
                for assertion in result.get("assertions", []):
                    summary["scenarios"][scenario_name]["assertions"][assertion.get("name")] = {
                        "success": assertion.get("success", False),
                        "description": assertion.get("description", "")
                    }
            
            # Add performance metrics summary
            if self.metrics:
                summary["performance"] = {
                    "test_duration": self.metrics.get("overall", {}).get("test_duration", 0.0),
                    "slowest_operations": self._get_slowest_operations(5)
                }

            self.logger.info(f"Test summary: {passed}/{total} scenarios passed ({summary['success_rate']})")
            if failed > 0:
               self.logger.warning(f"{failed} scenarios failed")
           
            return summary

        except Exception as e:
           self.logger.error(f"Error generating summary: {str(e)}")
           self.logger.error(traceback.format_exc())
           return {
               "error": str(e),
               "total": len(self.results),
               "passed": 0,
               "failed": len(self.results),
               "success_rate": "0.00%",
               "timestamp": datetime.datetime.now().isoformat()
           }

    
    def _get_slowest_operations(self, limit: int = 5) -> List[Dict[str, Any]]:
       """
       Get the slowest operations from the performance metrics.
       
       Args:
           limit: Maximum number of operations to return
           
       Returns:
           List of slow operation details
       """
       self.logger.debug(f"Finding {limit} slowest operations")
       
       if not self.metrics or "timers" not in self.metrics:
           self.logger.debug("No timer metrics available")
           return []
           
       try:
           # Get all timers and sort by total time
           timers = [(name, data) for name, data in self.metrics["timers"].items()]
           timers.sort(key=lambda x: x[1]["total_time"], reverse=True)
           
           # Return top N
           slowest = [
               {
                   "name": name,
                   "total_time": data["total_time"],
                   "avg_time": data["avg_time"],
                   "count": data["count"]
               }
               for name, data in timers[:limit]
           ]
           
           if slowest:
               self.logger.debug(f"Slowest operation: {slowest[0]['name']} ({slowest[0]['total_time']:.3f}s)")
           
           return slowest
       except Exception as e:
           self.logger.error(f"Error finding slowest operations: {str(e)}")
           return []
    

    async def save_report(self, output_dir: Optional[str] = None) -> str:
       """
       Save the test results and summary to disk.
       
       Args:
           output_dir: Optional custom output directory
           
       Returns:
           Path to the generated report directory
       """
       # Get report directory from config or use default
       if not output_dir:
           output_dir = self.config.get("reporting", {}).get("report_dir", "reports")
       
       self.logger.info(f"Saving test report to directory: {output_dir}")
       
       try:
           # Create output directory if it doesn't exist
           os.makedirs(output_dir, exist_ok=True)
           
           # Create timestamped report directory
           timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
           report_dir = os.path.join(output_dir, f"report_{timestamp}")
           os.makedirs(report_dir, exist_ok=True)
           
           self.logger.debug(f"Created report directory: {report_dir}")
           
           # Generate summary
           summary = self.generate_summary()
           
           # Save summary
           summary_path = os.path.join(report_dir, "summary.json")
           with open(summary_path, 'w') as f:
               json.dump(summary, f, indent=2)
           
           self.logger.debug(f"Saved summary to {summary_path}")
           
           # Save detailed results
           results_path = os.path.join(report_dir, "results.json")
           with open(results_path, 'w') as f:
               json.dump(self.results, f, indent=2)
           
           self.logger.debug(f"Saved detailed results to {results_path}")
           
           # Save performance metrics
           if self.metrics:
               metrics_path = os.path.join(report_dir, "metrics.json")
               with open(metrics_path, 'w') as f:
                   json.dump(self.metrics, f, indent=2)
               
               self.logger.debug(f"Saved performance metrics to {metrics_path}")
           
           # Generate HTML report if configured
           if self.config.get("reporting", {}).get("generate_html", True):
               self.logger.info("Generating HTML report")
               await self._generate_html_report(report_dir, summary)
           
           self.logger.info(f"Test report saved to {report_dir}")
           return report_dir
           
       except Exception as e:
           self.logger.error(f"Error saving report: {str(e)}")
           self.logger.error(traceback.format_exc())
           return output_dir
    
    async def _generate_html_report(self, report_dir: str, summary: Dict[str, Any]):
       """
       Generate an HTML report from the test results.
       
       Args:
           report_dir: Output directory for the report
           summary: Test summary dictionary
       """
       self.logger.debug("Generating HTML report")
       
       try:
           template_path = self.config.get("reporting", {}).get("report_template")
           
           if not template_path or not os.path.exists(template_path):
               self.logger.debug("Template not found, using built-in template")
               # Create basic HTML report without template
               html_path = os.path.join(report_dir, "report.html")
               
               # Simple HTML template
               html = f"""<!DOCTYPE html>
<html>
<head>
   <title>Marvin Test Harness Report - {summary.get('timestamp')}</title>
   <style>
       body {{ font-family: Arial, sans-serif; margin: 20px; }}
       h1, h2, h3 {{ color: #333; }}
       .summary {{ background-color: #f5f5f5; padding: 15px; border-radius: 5px; }}
       .pass {{ color: green; }}
       .fail {{ color: red; }}
       table {{ border-collapse: collapse; width: 100%; }}
       th, td {{ border: 1px solid #ddd; padding: 8px; text-align: left; }}
       th {{ background-color: #f2f2f2; }}
       tr:nth-child(even) {{ background-color: #f9f9f9; }}
   </style>
</head>
<body>
   <h1>Marvin Test Harness Report</h1>
   <div class="summary">
       <h2>Summary</h2>
       <p>Total Scenarios: {summary.get('total')}</p>
       <p>Passed: <span class="pass">{summary.get('passed')}</span></p>
       <p>Failed: <span class="fail">{summary.get('failed')}</span></p>
       <p>Success Rate: {summary.get('success_rate')}</p>
       <p>Timestamp: {summary.get('timestamp')}</p>
   </div>
   
   <h2>Scenario Results</h2>
   <table>
       <tr>
           <th>Scenario</th>
           <th>Status</th>
           <th>Execution Time</th>
           <th>Assertions</th>
       </tr>
       {"".join(f'<tr><td>{name}</td><td class="{"pass" if data.get("success") else "fail"}">{("PASS" if data.get("success") else "FAIL")}</td><td>{data.get("execution_time", 0):.3f}s</td><td>{len(data.get("assertions", {}))}</td></tr>' for name, data in summary.get("scenarios", {}).items())}
   </table>
   
   <h2>Performance Metrics</h2>
   <p>Test Duration: {summary.get("performance", {}).get("test_duration", 0):.3f}s</p>
   
   <h3>Slowest Operations</h3>
   <table>
       <tr>
           <th>Operation</th>
           <th>Total Time</th>
           <th>Average Time</th>
           <th>Count</th>
       </tr>
       {"".join(f'<tr><td>{op.get("name")}</td><td>{op.get("total_time", 0):.3f}s</td><td>{op.get("avg_time", 0):.3f}s</td><td>{op.get("count", 0)}</td></tr>' for op in summary.get("performance", {}).get("slowest_operations", []))}
   </table>
   
   <script>
       // Add any interactive JS here
   </script>
</body>
</html>"""
               
               with open(html_path, 'w') as f:
                   f.write(html)
               
               self.logger.debug(f"Created HTML report at {html_path} using built-in template")
           else:
               # Use template file
               self.logger.debug(f"Using template from {template_path}")
               with open(template_path, 'r') as f:
                   template = f.read()
               
               # Replace template variables
               html = template.replace("{{summary}}", json.dumps(summary, indent=2))
               html = html.replace("{{results}}", json.dumps(self.results, indent=2))
               html = html.replace("{{metrics}}", json.dumps(self.metrics, indent=2))
               
               # Save HTML report
               html_path = os.path.join(report_dir, "report.html")
               with open(html_path, 'w') as f:
                   f.write(html)
               
               self.logger.debug(f"Created HTML report at {html_path} using custom template")
       
       except Exception as e:
           self.logger.error(f"Error generating HTML report: {str(e)}")
           self.logger.error(traceback.format_exc())