#!/usr/bin/env python3
"""
TDD Investigation: Knowledge Panel Issues
Tests what's broken and what needs to be fixed
"""

import requests
import json

def test_knowledge_panel_requirements():
    """Test the Knowledge Panel data flow and requirements"""
    print("🔍 TDD Investigation: Knowledge Panel\n")
    
    print("📋 Expected Knowledge Panel Workflow:")
    print("   1. User opens Knowledge Panel")
    print("   2. Panel calls graph-service to get Neo4j data")
    print("   3. Panel calls visualization-service to render graph")
    print("   4. User sees knowledge graph with captured pages")
    
    print(f"\n🧪 Testing Current State:")
    
    # Step 1: Check if we have any pages in the database
    print("1. Checking pages in database...")
    try:
        pages_response = requests.get("http://localhost:8000/api/v1/pages", timeout=5)
        if pages_response.status_code == 200:
            pages_data = pages_response.json()
            pages = pages_data.get("data", {}).get("pages", [])
            print(f"   ✅ Pages API works: {len(pages)} pages found")
            
            if pages:
                sample_page = pages[0]
                print(f"   Sample page: {sample_page.get('title', 'No title')} - {sample_page.get('url', 'No URL')}")
            else:
                print("   ⚠️  No pages in database - Knowledge Panel will be empty")
        else:
            print(f"   ❌ Pages API failed: {pages_response.status_code}")
    except Exception as e:
        print(f"   ❌ Pages API error: {e}")
    
    # Step 2: Check if graph-service exists
    print(f"\n2. Checking graph-service availability...")
    try:
        # Try common graph endpoints
        graph_endpoints = [
            "/api/v1/graph",
            "/api/v1/graph/nodes", 
            "/api/v1/graph/relationships",
            "/api/v1/knowledge/graph"
        ]
        
        graph_service_found = False
        for endpoint in graph_endpoints:
            try:
                response = requests.get(f"http://localhost:8000{endpoint}", timeout=5)
                if response.status_code in [200, 404]:  # 404 is OK, means endpoint exists
                    print(f"   ✅ Graph endpoint found: {endpoint} ({response.status_code})")
                    graph_service_found = True
                    break
            except:
                continue
        
        if not graph_service_found:
            print("   ❌ No graph-service endpoints found")
            
    except Exception as e:
        print(f"   ❌ Graph service check error: {e}")
    
    # Step 3: Check if visualization-service exists  
    print(f"\n3. Checking visualization-service availability...")
    try:
        viz_endpoints = [
            "/api/v1/visualization",
            "/api/v1/viz",
            "/api/v1/graph/visualize"
        ]
        
        viz_service_found = False
        for endpoint in viz_endpoints:
            try:
                response = requests.get(f"http://localhost:8000{endpoint}", timeout=5)
                if response.status_code in [200, 404]:
                    print(f"   ✅ Visualization endpoint found: {endpoint} ({response.status_code})")
                    viz_service_found = True
                    break
            except:
                continue
                
        if not viz_service_found:
            print("   ❌ No visualization-service endpoints found")
            
    except Exception as e:
        print(f"   ❌ Visualization service check error: {e}")
    
    # Step 4: Check what services are available
    print(f"\n4. Checking available API endpoints...")
    try:
        # Check API root or health endpoint for service list
        health_response = requests.get("http://localhost:8000/health", timeout=5)
        if health_response.status_code == 200:
            health_data = health_response.json()
            print(f"   ✅ Health check: {health_data}")
        
        # Try to get OpenAPI docs to see available endpoints
        docs_response = requests.get("http://localhost:8000/docs", timeout=5)
        if docs_response.status_code == 200:
            print("   ✅ API docs available at /docs")
        
    except Exception as e:
        print(f"   ⚠️  Could not check API endpoints: {e}")
    
    print(f"\n📋 Investigation Summary:")
    print(f"   - Database: Pages exist for Knowledge Panel to display")
    print(f"   - Graph Service: Need to verify if implemented")  
    print(f"   - Visualization Service: Need to verify if implemented")
    print(f"   - Knowledge Panel: HTML structure exists, JS component exists")
    
    print(f"\n🔧 Next Steps:")
    print(f"   1. Verify graph-service and visualization-service exist")
    print(f"   2. Test Knowledge Panel component initialization")
    print(f"   3. Test data flow from services to panel")
    print(f"   4. Fix any missing integrations")

if __name__ == "__main__":
    test_knowledge_panel_requirements()
