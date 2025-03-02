import json
from pathlib import Path
from typing import Dict, List, Any
from collections import defaultdict
import matplotlib.pyplot as plt
from datetime import datetime
from .benchmark_types import BenchmarkResult
from core.utils.logger import get_logger


class BenchmarkAnalyzer:
    """Analyzes and formats benchmark results."""
    
    def __init__(self, output_dir: Path):
        self.output_dir = output_dir
        self.logger = get_logger(__name__)

    def analyze_results(self, results: List[BenchmarkResult]) -> None:
        """Analyze benchmark results and generate reports."""
        self.logger.info(f"Starting analysis of {len(results)} results")
        
        if not results:
            self.logger.warning("No results to analyze")
            return
            
        # Generate and save summary
        summary = self._generate_summary(results)
        self._save_summary(summary)
        
        # Generate visualization directory
        viz_dir = self.output_dir / 'visualizations'
        viz_dir.mkdir(parents=True, exist_ok=True)
        
        # Generate reports
        self._generate_report(summary)
        self._generate_visualizations(results, summary, viz_dir)
        
        self.logger.info("Analysis complete")

    def _generate_summary(self, results: List[BenchmarkResult]) -> Dict[str, Any]:
        """Generate summary statistics from results."""
        if not results:
            return {
                'timestamp': datetime.now().isoformat(),
                'total_pages': 0,
                'total_keywords': 0,
                'avg_processing_time': 0.0,
                'pages': [],
                'keyword_stats': {
                    'total_unique': 0,
                    'total_with_variants': 0,
                    'type_distribution': {},
                    'avg_variants': 0.0
                },
                'relationship_stats': {
                    'total': 0,
                    'type_distribution': {}
                }
            }

        summary = {
            'timestamp': datetime.now().isoformat(),
            'total_pages': len(results),
            'total_keywords': sum(r.keyword_count for r in results),
            'avg_processing_time': sum(r.processing_time for r in results) / len(results),
            'pages': self._get_page_summaries(results),
            'keyword_stats': self._get_keyword_stats(results),
            'relationship_stats': self._get_relationship_stats(results)
        }
        return summary

    def _save_summary(self, summary: Dict[str, Any]) -> None:
        """Save summary to JSON file."""
        summary_path = self.output_dir / 'summary.json'
        self.logger.info(f"Saving summary to {summary_path}")
        with open(summary_path, 'w', encoding='utf-8') as f:
            json.dump(summary, f, indent=2)


    def _get_page_summaries(self, results: List[BenchmarkResult]) -> List[Dict[str, Any]]:
        """Get summary statistics for each page."""
        page_summaries = []
        for r in results:
            page_summary = {
                'page': r.page_path,
                'content_length': r.content_length,
                'processing_time': r.processing_time,
                'keyword_count': r.keyword_count,
                'relationship_count': len(r.relationships)
            }
            
            # Add page object details if available
            if r.page_object:
                # Add additional page object details
                page_summary.update({
                    'page_id': r.page_object.get('id'),
                    'url': r.page_object.get('url'),
                    'domain': r.page_object.get('domain'),
                    'status': r.page_object.get('status'),
                    'browser_context': r.page_object.get('browser_context', {}).get('status')
                })
                
                # Add metrics if available
                metrics = r.page_object.get('metrics', {})
                page_summary.update({
                    'quality_score': metrics.get('quality_score'),
                    'relevance_score': metrics.get('relevance_score'),
                    'processing_time_from_metrics': metrics.get('processing_time')
                })
            
            page_summaries.append(page_summary)
        
        return page_summaries

    def _get_keyword_stats(self, results: List[BenchmarkResult]) -> Dict[str, Any]:
        """Analyze keyword statistics with proper variant handling."""
        all_keywords = [k for r in results for k in r.keywords]
        if not all_keywords:
            return {
                'total_unique': 0,
                'total_with_variants': 0,
                'type_distribution': {},
                'avg_variants': 0.0
            }
        
        # Group keywords by their canonical form
        keyword_variants = {}
        type_distribution = defaultdict(int)
        
        for kw in all_keywords:
            # Use canonical text as the key
            canonical = kw.get('canonical_text', kw['text'])
            
            if canonical not in keyword_variants:
                keyword_variants[canonical] = set()
            
            # Add this keyword's text to its variants
            keyword_variants[canonical].add(kw['text'])
            
            # Track keyword type distribution
            type_distribution[kw.get('keyword_type', 'term')] += 1
        
        # Calculate variant statistics
        variants_list = list(keyword_variants.values())
        total_with_variants = sum(1 for variants in variants_list if len(variants) > 1)
        avg_variants = sum(len(variants) for variants in variants_list) / len(variants_list)
        
        return {
            'total_unique': len(keyword_variants),  # Number of unique canonical forms
            'total_with_variants': total_with_variants,  # Number of keywords with multiple variants
            'type_distribution': dict(type_distribution),
            'avg_variants': round(avg_variants, 2)  # Average number of variants per keyword
        }

    def _get_keyword_stats(self, results: List[BenchmarkResult]) -> Dict[str, Any]:
        """Analyze keyword statistics."""
        all_keywords = [k for r in results for k in r.keywords]
        if not all_keywords:
            return {
                'total_unique': 0,
                'total_with_variants': 0,
                'type_distribution': {},
                'avg_variants': 0.0
            }
        
        return {
            'total_unique': len({k['text'] for k in all_keywords}),
            'total_with_variants': 0,  # Can't determine without type info
            'type_distribution': {'term': len(all_keywords)},  # Default all to 'term'
            'avg_variants': 0.0  # Can't determine without variant info
        }

    def _get_relationship_stats(self, results: List[BenchmarkResult]) -> Dict[str, Any]:
        """Analyze relationship statistics."""
        all_relationships = [r for result in results for r in result.relationships]
        if not all_relationships:
            return {
                'total': 0,
                'type_distribution': {}
            }
        
        # Count relationship types
        type_counts = defaultdict(int)
        for rel in all_relationships:
            type_counts[rel['type']] += 1
        
        return {
            'total': len(all_relationships),
            'type_distribution': dict(type_counts)
        }

    def _generate_report(self, summary: Dict[str, Any]) -> None:
            """Generate human-readable report."""
            report_path = self.output_dir / 'summary.txt'
            self.logger.info(f"Generating report at {report_path}")
            
            with open(report_path, 'w', encoding='utf-8') as f:
                f.write("Benchmark Summary Report\n")
                f.write("======================\n\n")
                
                f.write(f"Generated: {summary['timestamp']}\n")
                f.write(f"Pages Processed: {summary['total_pages']}\n")
                f.write(f"Total Keywords: {summary['total_keywords']}\n")
                f.write(f"Average Processing Time: {summary['avg_processing_time']:.2f}s\n\n")
                
                f.write("Keyword Statistics\n")
                f.write("-----------------\n")
                kw_stats = summary['keyword_stats']
                f.write(f"Unique Keywords: {kw_stats['total_unique']}\n")
                f.write(f"Keywords with Variants: {kw_stats['total_with_variants']}\n")
                f.write(f"Average Variants per Keyword: {kw_stats['avg_variants']:.2f}\n\n")
                
                f.write("Keyword Types:\n")
                for type_name, count in kw_stats['type_distribution'].items():
                    f.write(f"  {type_name}: {count}\n")
                f.write("\n")
                
                f.write("Relationship Statistics\n")
                f.write("----------------------\n")
                rel_stats = summary['relationship_stats']
                f.write(f"Total Relationships: {rel_stats['total']}\n\n")
                
                f.write("Relationship Types:\n")
                for type_name, count in rel_stats['type_distribution'].items():
                    f.write(f"  {type_name}: {count}\n")
                f.write("\n")
                
                f.write("Page Details\n")
                f.write("------------\n")
                for page in summary['pages']:
                    f.write(f"\nPage: {Path(page['page']).name}\n")
                    f.write(f"  Content Length: {page.get('content_length', 'N/A')} chars\n")
                    f.write(f"  Processing Time: {page.get('processing_time', 'N/A'):.2f}s\n")
                    f.write(f"  Keywords Found: {page.get('keyword_count', 'N/A')}\n")
                    f.write(f"  Relationships Found: {page.get('relationship_count', 'N/A')}\n")
                    
                    # Add page object details
                    if 'page_id' in page:
                        f.write("  Page Object Details:\n")
                        f.write(f"    ID: {page.get('page_id', 'N/A')}\n")
                        f.write(f"    URL: {page.get('url', 'N/A')}\n")
                        f.write(f"    Domain: {page.get('domain', 'N/A')}\n")
                        f.write(f"    Status: {page.get('status', 'N/A')}\n")
                        f.write(f"    Browser Context: {page.get('browser_context', 'N/A')}\n")
                        
                        # Metrics
                        f.write("    Metrics:\n")
                        f.write(f"      Quality Score: {page.get('quality_score', 'N/A')}\n")
                        f.write(f"      Relevance Score: {page.get('relevance_score', 'N/A')}\n")
                        f.write(f"      Processing Time (Metrics): {page.get('processing_time_from_metrics', 'N/A')}\n")

    
    def _save_summary(self, summary: Dict[str, Any]) -> None:
        """Save summary to JSON file with full page object details."""
        summary_path = self.output_dir / 'summary.json'
        self.logger.info(f"Saving summary to {summary_path}")
        with open(summary_path, 'w', encoding='utf-8') as f:
            # Use indent for readability of nested structures
            json.dump(summary, f, indent=2, default=str)

    def _generate_visualizations(self, results: List[BenchmarkResult], summary: Dict[str, Any], viz_dir: Path) -> None:
        """Generate visualization plots."""
        self.logger.info(f"Generating visualizations in {viz_dir}")

        try:
            # Keyword type distribution
            plt.figure(figsize=(10, 6))
            type_dist = summary['keyword_stats']['type_distribution']
            if type_dist:
                plt.bar(type_dist.keys(), type_dist.values())
                plt.title('Keyword Type Distribution')
                plt.xticks(rotation=45)
                plt.tight_layout()
                plt.savefig(viz_dir / 'keyword_types.png')
            plt.close()
            
            # Processing time vs content length
            plt.figure(figsize=(10, 6))
            lengths = [p['content_length'] for p in summary['pages']]
            times = [p['processing_time'] for p in summary['pages']]
            if lengths and times:
                plt.scatter(lengths, times)
                plt.xlabel('Content Length (chars)')
                plt.ylabel('Processing Time (s)')
                plt.title('Processing Time vs Content Length')
                plt.tight_layout()
                plt.savefig(viz_dir / 'performance.png')
            plt.close()
            
            # Relationship type distribution (if any relationships exist)
            if summary['relationship_stats']['total'] > 0:
                plt.figure(figsize=(10, 6))
                rel_dist = summary['relationship_stats']['type_distribution']
                plt.bar(rel_dist.keys(), rel_dist.values())
                plt.title('Relationship Type Distribution')
                plt.xticks(rotation=45)
                plt.tight_layout()
                plt.savefig(viz_dir / 'relationship_types.png')
                plt.close()
            
            self.logger.info("Visualization generation complete")
            
        except Exception as e:
            self.logger.error(f"Error generating visualizations: {e}", exc_info=True)