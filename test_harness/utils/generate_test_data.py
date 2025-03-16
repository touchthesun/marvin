"""
Generate test data for Neo4j integration testing.

This script creates:
1. A Cypher script for Neo4j test data
2. Sample browser state JSON
3. Mock LLM responses
4. Sample web pages
"""

import os
import json
import random
import argparse
from datetime import datetime, timedelta
from typing import Dict, Any

from core.utils.logger import get_logger

logger = get_logger(__name__)

def generate_page_data(num_pages=15) -> str:
    """
    Generate sample page data for knowledge graph.
    
    Args:
        num_pages: Number of pages to generate
        
    Returns:
        Cypher script as string
    """
    # Test data constants
    domains = [
        "example.com", "test.org", "docs.python.org", 
        "github.com", "stackoverflow.com", "wikipedia.org"
    ]
    
    categories = ["Technology", "Research", "Reference", "News", "Education"]
    
    # Templates for page titles and content snippets
    title_templates = [
        "Guide to {topic}",
        "Understanding {topic}",
        "{topic} Tutorial",
        "Introduction to {topic}",
        "{topic} Reference",
        "Advanced {topic}",
        "{topic} Documentation",
        "Learn {topic}"
    ]
    
    topics = [
        "Python", "Machine Learning", "Data Science", "Web Development",
        "Artificial Intelligence", "Algorithms", "Databases", "API Design",
        "Software Architecture", "Testing", "DevOps", "Cloud Computing"
    ]
    
    # Generate cypher script
    script = "// Generated test data for knowledge graph\n\n"
    
    # Create constraints for uniqueness
    script += "// Create constraints\n"
    script += "CREATE CONSTRAINT IF NOT EXISTS FOR (p:Page) REQUIRE p.url IS UNIQUE;\n"
    script += "CREATE CONSTRAINT IF NOT EXISTS FOR (s:Site) REQUIRE s.domain IS UNIQUE;\n\n"
    
    # Create pages
    script += "// Create page nodes\n"
    
    pages = []
    for i in range(num_pages):
        domain = random.choice(domains)
        topic = random.choice(topics)
        title_template = random.choice(title_templates)
        title = title_template.replace("{topic}", topic)
        
        # Generate timestamp within last 30 days
        timestamp = (datetime.now() - timedelta(days=random.randint(0, 30))).isoformat()
        
        path = f"/{topic.lower().replace(' ', '-')}/{i+1}"
        url = f"https://{domain}{path}"
        
        # Create page node
        script += f"""
CREATE (p{i}:Page {{
    url: "{url}",
    title: "{title}",
    domain: "{domain}",
    discovered_at: datetime("{timestamp}"),
    processed_at: datetime("{timestamp}"),
    status: "PROCESSED",
    category: "{random.choice(categories)}"
}});\n"""
        pages.append(f"p{i}")
    
    # Create site nodes and relationships
    script += "\n// Create site nodes and relationships\n"
    for domain in domains:
        script += f"""
CREATE (s_{domain.replace(".", "_")}:Site {{
    domain: "{domain}", 
    url: "https://{domain}"
}});\n"""
    
    # Connect pages to sites
    script += "\n// Connect pages to sites\n"
    for i, page in enumerate(pages):
        domain = script.split(f"{page}:Page")[1].split('domain: "')[1].split('"')[0]
        domain_node = f"s_{domain.replace('.', '_')}"
        
        script += f"""
MATCH (p:{page}), (s:{domain_node})
CREATE (p)-[:BELONGS_TO]->>(s);\n"""
    
    # Create relationships between pages
    script += "\n// Create relationships between pages\n"
    
    # Ensure each page has at least one relationship
    for i, page in enumerate(pages):
        # Link to 1-3 other pages
        num_links = random.randint(1, min(3, num_pages-1))
        target_indices = random.sample([j for j in range(num_pages) if j != i], num_links)
        
        for target_idx in target_indices:
            strength = round(random.uniform(0.5, 1.0), 2)
            relationship_type = random.choice(["LINKS_TO", "SIMILAR_TO", "RELATED_TO"])
            
            script += f"""
MATCH (a:{page}), (b:p{target_idx})
CREATE (a)-[:{relationship_type} {{strength: {strength}, created_at: datetime("{timestamp}")}}]->(b);\n"""
    
    # Add keywords to pages
    script += "\n// Add keywords to pages\n"
    
    keywords = [
        "python", "programming", "development", "software", "tutorial",
        "guide", "reference", "learning", "code", "example", "algorithm",
        "database", "web", "api", "cloud", "machine learning", "ai"
    ]
    
    for i, page in enumerate(pages):
        # Add 3-5 keywords per page
        num_keywords = random.randint(3, 5)
        page_keywords = random.sample(keywords, num_keywords)
        
        script += f"""
MATCH (p:{page})
SET p.keywords = {json.dumps(page_keywords)};\n"""
    
    return script

def generate_browser_state(num_tabs=5, num_bookmarks=10) -> Dict[str, Any]:
    """
    Generate a sample browser state.
    
    Args:
        num_tabs: Number of browser tabs
        num_bookmarks: Number of bookmarks
        
    Returns:
        Browser state as dict
    """
    domains = [
        "example.com", "test.org", "docs.python.org", 
        "github.com", "stackoverflow.com", "wikipedia.org"
    ]
    
    tabs = []
    for i in range(num_tabs):
        domain = random.choice(domains)
        path = f"/{random.choice(['page', 'article', 'doc', 'post'])}/{i+1}"
        tabs.append({
            "id": f"tab_{i+1}",
            "url": f"https://{domain}{path}",
            "title": f"Test Page {i+1} on {domain}",
            "window_id": "1"
        })
    
    bookmarks = []
    for i in range(num_bookmarks):
        domain = random.choice(domains)
        path = f"/{random.choice(['page', 'article', 'doc', 'post'])}/{i+100}"
        bookmarks.append({
            "id": f"bookmark_{i+1}",
            "url": f"https://{domain}{path}",
            "title": f"Bookmark {i+1} on {domain}",
            "folder": random.choice(["Research", "Work", "Personal", "Uncategorized"])
        })
    
    return {
        "tabs": tabs,
        "bookmarks": bookmarks,
        "history": [],
        "settings": {
            "extension_enabled": True,
            "auto_capture": True
        }
    }

def generate_llm_responses() -> Dict[str, Any]:
    """
    Generate mock LLM responses for testing.
    
    Returns:
        LLM response dict
    """
    responses = {
        "default": {
            "id": "chatcmpl-123",
            "object": "chat.completion",
            "created": int(datetime.now().timestamp()),
            "model": "claude-3-opus-20240229",
            "choices": [
                {
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": "This is a default mock response from the test harness."
                    },
                    "finish_reason": "stop"
                }
            ],
            "usage": {
                "prompt_tokens": 10,
                "completion_tokens": 20,
                "total_tokens": 30
            }
        },
        "knowledge": {
            "id": "chatcmpl-124",
            "object": "chat.completion",
            "created": int(datetime.now().timestamp()),
            "model": "claude-3-opus-20240229",
            "choices": [
                {
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": "Based on the knowledge graph, I found several related pages. The most relevant information indicates that this topic is related to software development best practices."
                    },
                    "finish_reason": "stop"
                }
            ],
            "usage": {
                "prompt_tokens": 15,
                "completion_tokens": 25,
                "total_tokens": 40
            }
        },
        "research": {
            "id": "chatcmpl-125",
            "object": "chat.completion",
            "created": int(datetime.now().timestamp()),
            "model": "claude-3-opus-20240229",
            "choices": [
                {
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": "I've researched this topic and found multiple sources discussing various approaches. The consensus appears to be that methodical testing and documentation are key factors for success."
                    },
                    "finish_reason": "stop"
                }
            ],
            "usage": {
                "prompt_tokens": 20,
                "completion_tokens": 30,
                "total_tokens": 50
            }
        }
    }
    
    return responses

def generate_sample_pages() -> Dict[str, str]:
    """
    Generate sample HTML pages for testing.
    
    Returns:
        Dict mapping URL identifiers to HTML content
    """
    pages = {}
    
    # Simple test page
    test_page = """
    <html>
    <head>
        <title>Test Page for Integration Testing</title>
        <meta name="description" content="This is a test page for integration testing">
        <meta name="keywords" content="test, integration, neo4j">
    </head>
    <body>
        <h1>Test Page for Integration Testing</h1>
        <p>This is a simple test page used for integration testing of the Marvin system.</p>
        <p>It contains basic HTML elements and metadata for testing content extraction.</p>
        
        <h2>Test Section</h2>
        <p>This section tests the content extraction capabilities.</p>
        
        <ul>
            <li>Test item 1</li>
            <li>Test item 2</li>
            <li>Test item 3</li>
        </ul>
        
        <a href="https://example.com/related">Related Page</a>
    </body>
    </html>
    """
    
    pages["test_example_com"] = test_page
    
    # Documentation page
    docs_page = """
    <html>
    <head>
        <title>API Documentation</title>
        <meta name="description" content="Documentation for the test API">
        <meta name="keywords" content="api, documentation, reference">
    </head>
    <body>
        <h1>API Documentation</h1>
        <p>Welcome to the API documentation for the test system.</p>
        
        <h2>Endpoints</h2>
        <ul>
            <li><code>GET /api/v1/items</code> - List all items</li>
            <li><code>POST /api/v1/items</code> - Create a new item</li>
            <li><code>GET /api/v1/items/{id}</code> - Get a specific item</li>
        </ul>
        
        <h2>Authentication</h2>
        <p>All requests require authentication using a bearer token.</p>
        
        <pre><code>
        Authorization: Bearer {your_token}
        </code></pre>
        
        <a href="https://example.com/test">Back to Test Page</a>
    </body>
    </html>
    """
    
    pages["docs_example_com"] = docs_page
    
    # Tech blog page
    blog_page = """
    <html>
    <head>
        <title>Understanding Neo4j Graph Databases</title>
        <meta name="description" content="An introduction to Neo4j and graph databases">
        <meta name="keywords" content="neo4j, graph database, nosql, database">
    </head>
    <body>
        <h1>Understanding Neo4j Graph Databases</h1>
        <p>Graph databases are becoming increasingly popular for managing complex, connected data.</p>
        
        <h2>Why Neo4j?</h2>
        <p>Neo4j is one of the leading graph database platforms, offering:</p>
        <ul>
            <li>Native graph storage and processing</li>
            <li>Cypher query language</li>
            <li>ACID transactions</li>
            <li>High availability clustering</li>
        </ul>
        
        <h2>Key Concepts</h2>
        <p>Understanding these key concepts is essential:</p>
        <ul>
            <li><strong>Nodes</strong>: Entities in your domain</li>
            <li><strong>Relationships</strong>: Connections between nodes</li>
            <li><strong>Properties</strong>: Attributes of nodes and relationships</li>
            <li><strong>Labels</strong>: Grouping and categorization</li>
        </ul>
        
        <a href="https://neo4j.com">Learn more at Neo4j.com</a>
    </body>
    </html>
    """
    
    pages["blog_example_com"] = blog_page
    
    return pages

def generate_test_data_files(output_dir: str, num_pages: int = 15) -> None:
    """
    Generate all test data files and save them to the output directory.
    
    Args:
        output_dir: Directory to save test data
        num_pages: Number of page nodes to generate
    """
    logger.info(f"Generating test data in {output_dir}")
    
    # Create output directory structure
    os.makedirs(output_dir, exist_ok=True)
    pages_dir = os.path.join(output_dir, "pages")
    os.makedirs(pages_dir, exist_ok=True)
    
    # Generate and save Neo4j test data
    logger.info(f"Generating Neo4j test data with {num_pages} pages")
    neo4j_data = generate_page_data(num_pages)
    neo4j_file = os.path.join(output_dir, "graph_data.cypher")
    with open(neo4j_file, 'w') as f:
        f.write(neo4j_data)
    logger.info(f"Saved Neo4j test data to {neo4j_file}")
    
    # Generate and save browser state
    logger.info("Generating browser state data")
    browser_state = generate_browser_state()
    browser_file = os.path.join(output_dir, "browser_state.json")
    with open(browser_file, 'w') as f:
        json.dump(browser_state, f, indent=2)
    logger.info(f"Saved browser state to {browser_file}")
    
    # Generate and save LLM responses
    logger.info("Generating LLM response data")
    llm_responses = generate_llm_responses()
    llm_file = os.path.join(output_dir, "llm_responses.json")
    with open(llm_file, 'w') as f:
        json.dump(llm_responses, f, indent=2)
    logger.info(f"Saved LLM responses to {llm_file}")
    
    # Generate and save sample pages
    logger.info("Generating sample HTML pages")
    sample_pages = generate_sample_pages()
    for page_name, html_content in sample_pages.items():
        page_file = os.path.join(pages_dir, f"{page_name}.html")
        with open(page_file, 'w') as f:
            f.write(html_content)
    logger.info(f"Saved {len(sample_pages)} sample pages to {pages_dir}")
    
    # Log summary
    logger.info("Test data generation complete:")
    logger.info(f"- Neo4j data: {neo4j_file}")
    logger.info(f"- Browser state: {browser_file}")
    logger.info(f"- LLM responses: {llm_file}")
    logger.info(f"- Sample pages: {len(sample_pages)} files in {pages_dir}")

def main():
    """Main entry point for the script."""
    parser = argparse.ArgumentParser(description="Generate test data for Marvin integration testing")
    parser.add_argument("--output-dir", default="fixtures/pages", help="Output directory for test data")
    parser.add_argument("--num-pages", type=int, default=15, help="Number of page nodes to generate")
    args = parser.parse_args()
    
    # Generate test data
    generate_test_data_files(args.output_dir, args.num_pages)

if __name__ == "__main__":
    main()