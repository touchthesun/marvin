#!/usr/bin/env python3
"""
TDD Comprehensive Test Suite: Knowledge Panel
Tests every aspect of the Knowledge Panel data flow to identify root causes
"""

import requests
import json
import time

def test_backend_api_endpoints():
    """Test 1: Verify backend API endpoints are working"""
    print("🧪 Test 1: Backend API Endpoints")
    print("=" * 50)
    
    endpoints = {
        "/api/v1/graph/overview": "Graph overview data",
        "/api/v1/pages": "Pages data", 
        "/api/v1/graph/search": "Graph search",
        "/api/v1/health": "Health check"
    }
    
    results = {}
    for endpoint, description in endpoints.items():
        try:
            response = requests.get(f"http://localhost:8000{endpoint}", timeout=5)
            results[endpoint] = {
                "status": response.status_code,
                "success": response.status_code == 200,
                "description": description
            }
            
            if response.status_code == 200:
                data = response.json()
                results[endpoint]["data_keys"] = list(data.keys())
                if "data" in data and isinstance(data["data"], dict):
                    results[endpoint]["data_structure"] = list(data["data"].keys())
                    
            print(f"   ✅ {endpoint}: {response.status_code} - {description}")
        except Exception as e:
            results[endpoint] = {
                "status": "ERROR",
                "success": False,
                "error": str(e),
                "description": description
            }
            print(f"   ❌ {endpoint}: ERROR - {str(e)[:50]}...")
    
    return results

def test_graph_overview_data_format():
    """Test 2: Verify graph overview data format matches Knowledge Panel expectations"""
    print("\n🧪 Test 2: Graph Overview Data Format")
    print("=" * 50)
    
    try:
        response = requests.get("http://localhost:8000/api/v1/graph/overview", timeout=5)
        
        if response.status_code != 200:
            print(f"   ❌ API call failed: {response.status_code}")
            return False
            
        data = response.json()
        
        # Check top-level structure
        required_top_level = ["success", "data"]
        missing_top = [key for key in required_top_level if key not in data]
        
        if missing_top:
            print(f"   ❌ Missing top-level keys: {missing_top}")
            return False
            
        print(f"   ✅ Top-level structure correct: {list(data.keys())}")
        
        # Check data structure
        graph_data = data["data"]
        required_data_keys = ["nodes", "edges"]
        missing_data = [key for key in required_data_keys if key not in graph_data]
        
        if missing_data:
            print(f"   ❌ Missing data keys: {missing_data}")
            return False
            
        print(f"   ✅ Data structure correct: {list(graph_data.keys())}")
        
        # Check node format
        nodes = graph_data["nodes"]
        edges = graph_data["edges"]
        
        print(f"   📊 Found {len(nodes)} nodes, {len(edges)} edges")
        
        if nodes:
            sample_node = nodes[0]
            required_node_fields = ["id", "url", "domain"]
            optional_node_fields = ["title", "last_active", "metadata"]
            
            missing_required = [field for field in required_node_fields if field not in sample_node]
            available_optional = [field for field in optional_node_fields if field in sample_node]
            
            if missing_required:
                print(f"   ❌ Missing required node fields: {missing_required}")
                return False
                
            print(f"   ✅ Node format correct: {list(sample_node.keys())}")
            print(f"   📋 Required fields: {required_node_fields}")
            print(f"   📋 Available optional fields: {available_optional}")
        else:
            print(f"   ⚠️  No nodes found - Knowledge Panel will be empty")
            
        # Check edge format (if any)
        if edges:
            sample_edge = edges[0]
            print(f"   ✅ Edge format: {list(sample_edge.keys())}")
        else:
            print(f"   ⚠️  No edges found - no relationships to display")
            
        return True
        
    except Exception as e:
        print(f"   ❌ Data format test failed: {e}")
        return False

def test_knowledge_panel_api_integration():
    """Test 3: Simulate what Knowledge Panel should do"""
    print("\n🧪 Test 3: Knowledge Panel API Integration Simulation")
    print("=" * 50)
    
    # Simulate the exact API call Knowledge Panel makes
    print("   🔄 Simulating Knowledge Panel API call...")
    
    try:
        # This matches the call in knowledge-panel.js: apiService.getGraphOverview({ limit: 100 })
        response = requests.get("http://localhost:8000/api/v1/graph/overview?limit=100", timeout=5)
        
        if response.status_code != 200:
            print(f"   ❌ API call failed: {response.status_code}")
            return False
            
        data = response.json()
        
        # Simulate the data processing in loadKnowledgeData()
        if data.get("success") and data.get("data"):
            pages = data["data"].get("pages", [])
            nodes = data["data"].get("nodes", [])
            edges = data["data"].get("edges", [])
            
            print(f"   ✅ API call successful")
            print(f"   📊 Data received: {len(pages)} pages, {len(nodes)} nodes, {len(edges)} edges")
            
            # Simulate the data assignment in Knowledge Panel
            current_data = {
                "pages": pages,
                "graphData": {
                    "nodes": nodes,
                    "edges": edges
                }
            }
            
            print(f"   ✅ Data structure created for Knowledge Panel")
            print(f"   📋 Pages: {len(current_data['pages'])}")
            print(f"   📋 Graph nodes: {len(current_data['graphData']['nodes'])}")
            print(f"   📋 Graph edges: {len(current_data['graphData']['edges'])}")
            
            return True
        else:
            print(f"   ❌ Invalid response format: {data}")
            return False
            
    except Exception as e:
        print(f"   ❌ Integration test failed: {e}")
        return False

def test_visualization_data_requirements():
    """Test 4: Check if data is suitable for visualization"""
    print("\n🧪 Test 4: Visualization Data Requirements")
    print("=" * 50)
    
    try:
        response = requests.get("http://localhost:8000/api/v1/graph/overview", timeout=5)
        data = response.json()
        
        if not data.get("success"):
            print(f"   ❌ API call not successful")
            return False
            
        graph_data = data["data"]
        nodes = graph_data.get("nodes", [])
        edges = graph_data.get("edges", [])
        
        # Check if we have enough data for meaningful visualization
        if len(nodes) == 0:
            print(f"   ❌ No nodes for visualization")
            return False
            
        print(f"   ✅ Sufficient nodes for visualization: {len(nodes)}")
        
        # Check node data quality for visualization
        sample_node = nodes[0]
        viz_requirements = {
            "id": "Unique identifier for node",
            "url": "Node label/name", 
            "domain": "Node grouping/category"
        }
        
        missing_viz_fields = [field for field in viz_requirements.keys() if field not in sample_node]
        
        if missing_viz_fields:
            print(f"   ❌ Missing visualization fields: {missing_viz_fields}")
            return False
            
        print(f"   ✅ Node data suitable for visualization")
        
        # Check relationships
        if len(edges) == 0:
            print(f"   ⚠️  No relationships - graph will show isolated nodes")
        else:
            print(f"   ✅ Relationships available: {len(edges)}")
            
        return True
        
    except Exception as e:
        print(f"   ❌ Visualization test failed: {e}")
        return False

def test_error_scenarios():
    """Test 5: Test error handling scenarios"""
    print("\n🧪 Test 5: Error Handling Scenarios")
    print("=" * 50)
    
    error_tests = [
        {
            "name": "Invalid endpoint",
            "url": "http://localhost:8000/api/v1/graph/invalid",
            "expected_status": 404
        },
        {
            "name": "Invalid parameters", 
            "url": "http://localhost:8000/api/v1/graph/overview?limit=invalid",
            "expected_status": 422
        },
        {
            "name": "Very large limit",
            "url": "http://localhost:8000/api/v1/graph/overview?limit=10000",
            "expected_status": 200  # Should work but might be slow
        }
    ]
    
    for test in error_tests:
        try:
            response = requests.get(test["url"], timeout=5)
            status = response.status_code
            
            if status == test["expected_status"]:
                print(f"   ✅ {test['name']}: {status} (expected)")
            else:
                print(f"   ⚠️  {test['name']}: {status} (expected {test['expected_status']})")
                
        except Exception as e:
            print(f"   ❌ {test['name']}: ERROR - {str(e)[:50]}...")

def generate_test_report():
    """Generate comprehensive test report"""
    print("\n📊 TDD Test Report: Knowledge Panel")
    print("=" * 60)
    
    # Run all tests
    test_results = {}
    
    print("Running comprehensive test suite...")
    
    # Test 1: Backend API
    api_results = test_backend_api_endpoints()
    test_results["backend_api"] = api_results
    
    # Test 2: Data Format
    format_ok = test_graph_overview_data_format()
    test_results["data_format"] = format_ok
    
    # Test 3: Integration
    integration_ok = test_knowledge_panel_api_integration()
    test_results["integration"] = integration_ok
    
    # Test 4: Visualization
    viz_ok = test_visualization_data_requirements()
    test_results["visualization"] = viz_ok
    
    # Test 5: Error Handling
    test_error_scenarios()
    
    # Summary
    print(f"\n📋 Test Summary:")
    print(f"   Backend API: {'✅ PASS' if any(r['success'] for r in api_results.values()) else '❌ FAIL'}")
    print(f"   Data Format: {'✅ PASS' if format_ok else '❌ FAIL'}")
    print(f"   Integration: {'✅ PASS' if integration_ok else '❌ FAIL'}")
    print(f"   Visualization: {'✅ PASS' if viz_ok else '❌ FAIL'}")
    
    # Root Cause Analysis
    print(f"\n🔍 Root Cause Analysis:")
    
    if not format_ok:
        print(f"   ❌ CRITICAL: Data format issues - Knowledge Panel can't process API response")
    elif not integration_ok:
        print(f"   ❌ CRITICAL: API integration issues - Knowledge Panel can't call backend")
    elif not viz_ok:
        print(f"   ⚠️  WARNING: Visualization issues - data not suitable for graph display")
    else:
        print(f"   ✅ All backend tests pass - issue likely in frontend Knowledge Panel code")
        print(f"   🔧 Next: Check browser console for JavaScript errors")
        print(f"   🔧 Next: Verify Knowledge Panel is calling the API")
        print(f"   🔧 Next: Check if data is being passed to visualization service")
    
    return test_results

if __name__ == "__main__":
    generate_test_report()
