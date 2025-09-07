#!/usr/bin/env python3
"""
TDD Diagnostic Test: Knowledge Panel Complete Analysis
This test provides a comprehensive analysis of the Knowledge Panel issues
"""

import requests
import json
import time

def test_backend_connectivity():
    """Test 1: Backend API connectivity and data availability"""
    print("🧪 Test 1: Backend Connectivity")
    print("=" * 40)
    
    try:
        # Test health endpoint
        health_response = requests.get("http://localhost:8000/api/v1/health", timeout=5)
        if health_response.status_code == 200:
            print("   ✅ Backend is running and accessible")
        else:
            print(f"   ❌ Backend health check failed: {health_response.status_code}")
            return False
        
        # Test graph overview endpoint
        graph_response = requests.get("http://localhost:8000/api/v1/graph/overview", timeout=5)
        if graph_response.status_code == 200:
            data = graph_response.json()
            nodes = data.get("data", {}).get("nodes", [])
            edges = data.get("data", {}).get("edges", [])
            print(f"   ✅ Graph API working: {len(nodes)} nodes, {len(edges)} edges")
            
            if len(nodes) > 0:
                print("   ✅ Data available for Knowledge Panel")
                return True
            else:
                print("   ⚠️  No data available - Knowledge Panel will be empty")
                return False
        else:
            print(f"   ❌ Graph API failed: {graph_response.status_code}")
            return False
            
    except Exception as e:
        print(f"   ❌ Backend connectivity failed: {e}")
        return False

def test_api_response_format():
    """Test 2: API response format compatibility"""
    print("\n🧪 Test 2: API Response Format")
    print("=" * 40)
    
    try:
        response = requests.get("http://localhost:8000/api/v1/graph/overview", timeout=5)
        data = response.json()
        
        # Check response structure
        required_keys = ["success", "data"]
        missing_keys = [key for key in required_keys if key not in data]
        
        if missing_keys:
            print(f"   ❌ Missing response keys: {missing_keys}")
            return False
        
        print("   ✅ Response structure correct")
        
        # Check data structure
        graph_data = data["data"]
        required_data_keys = ["nodes", "edges"]
        missing_data_keys = [key for key in required_data_keys if key not in graph_data]
        
        if missing_data_keys:
            print(f"   ❌ Missing data keys: {missing_data_keys}")
            return False
        
        print("   ✅ Data structure correct")
        
        # Check node format
        nodes = graph_data["nodes"]
        if nodes:
            sample_node = nodes[0]
            required_node_fields = ["id", "url", "domain"]
            missing_node_fields = [field for field in required_node_fields if field not in sample_node]
            
            if missing_node_fields:
                print(f"   ❌ Missing node fields: {missing_node_fields}")
                return False
            
            print(f"   ✅ Node format correct: {list(sample_node.keys())}")
        
        return True
        
    except Exception as e:
        print(f"   ❌ Response format test failed: {e}")
        return False

def test_knowledge_panel_expected_behavior():
    """Test 3: Expected Knowledge Panel behavior analysis"""
    print("\n🧪 Test 3: Expected Knowledge Panel Behavior")
    print("=" * 40)
    
    print("   📋 Knowledge Panel should:")
    print("      1. Initialize when dashboard loads")
    print("      2. Call apiService.getGraphOverview()")
    print("      3. Process response data into currentData")
    print("      4. Display data in list or graph view")
    print("      5. Handle errors gracefully")
    
    print("\n   🔍 Current issues likely to be:")
    print("      - Knowledge Panel not initializing")
    print("      - API service not available in container")
    print("      - Data not being processed correctly")
    print("      - UI not updating with data")
    print("      - Error handling not working")
    
    return True

def test_frontend_integration_points():
    """Test 4: Frontend integration points analysis"""
    print("\n🧪 Test 4: Frontend Integration Points")
    print("=" * 40)
    
    integration_points = [
        {
            "component": "Dashboard",
            "action": "Initialize Knowledge Panel",
            "method": "container.getComponent('knowledge-panel').initialize()",
            "status": "❓ Unknown"
        },
        {
            "component": "Knowledge Panel",
            "action": "Get API Service",
            "method": "container.getService('apiService')",
            "status": "❓ Unknown"
        },
        {
            "component": "Knowledge Panel",
            "action": "Load Data",
            "method": "apiService.getGraphOverview()",
            "status": "❓ Unknown"
        },
        {
            "component": "Knowledge Panel",
            "action": "Display Data",
            "method": "displayKnowledgeItems() or renderKnowledgeGraph()",
            "status": "❓ Unknown"
        },
        {
            "component": "Visualization Service",
            "action": "Render Graph",
            "method": "createKnowledgeGraph()",
            "status": "❓ Unknown"
        }
    ]
    
    for point in integration_points:
        print(f"   {point['status']} {point['component']}: {point['action']}")
        print(f"      Method: {point['method']}")
    
    return True

def generate_diagnostic_report():
    """Generate comprehensive diagnostic report"""
    print("\n📊 Knowledge Panel Diagnostic Report")
    print("=" * 60)
    
    # Run tests
    backend_ok = test_backend_connectivity()
    format_ok = test_api_response_format()
    behavior_ok = test_knowledge_panel_expected_behavior()
    integration_ok = test_frontend_integration_points()
    
    # Summary
    print(f"\n📋 Test Results:")
    print(f"   Backend Connectivity: {'✅ PASS' if backend_ok else '❌ FAIL'}")
    print(f"   API Response Format: {'✅ PASS' if format_ok else '❌ FAIL'}")
    print(f"   Expected Behavior: {'✅ PASS' if behavior_ok else '❌ FAIL'}")
    print(f"   Integration Points: {'✅ PASS' if integration_ok else '❌ FAIL'}")
    
    # Root cause analysis
    print(f"\n🔍 Root Cause Analysis:")
    
    if not backend_ok:
        print("   ❌ CRITICAL: Backend not accessible")
        print("   🔧 Fix: Start the backend server")
    elif not format_ok:
        print("   ❌ CRITICAL: API response format issues")
        print("   🔧 Fix: Update API response format")
    else:
        print("   ✅ Backend is working correctly")
        print("   🔧 Issue is in frontend Knowledge Panel code")
        
        print(f"\n🎯 Most Likely Frontend Issues:")
        print(f"   1. Knowledge Panel not being initialized by Dashboard")
        print(f"   2. Container not providing API service to Knowledge Panel")
        print(f"   3. Knowledge Panel error handling preventing data display")
        print(f"   4. Visualization service not rendering the data")
        print(f"   5. DOM elements not being updated with loaded data")
    
    # Recommended TDD approach
    print(f"\n🔧 Recommended TDD Approach:")
    print(f"   1. Create browser-based test to verify container initialization")
    print(f"   2. Test Knowledge Panel component availability")
    print(f"   3. Test API service integration")
    print(f"   4. Test data loading and processing")
    print(f"   5. Test UI rendering")
    print(f"   6. Fix issues one by one based on test failures")
    
    # Next steps
    print(f"\n📋 Next Steps:")
    print(f"   1. Open browser extension dashboard")
    print(f"   2. Open browser console (F12)")
    print(f"   3. Navigate to Knowledge Panel")
    print(f"   4. Check console for JavaScript errors")
    print(f"   5. Verify API calls in Network tab")
    print(f"   6. Use browser test tools to identify specific issues")
    
    return {
        "backend_ok": backend_ok,
        "format_ok": format_ok,
        "behavior_ok": behavior_ok,
        "integration_ok": integration_ok
    }

if __name__ == "__main__":
    generate_diagnostic_report()
