#!/usr/bin/env python3
"""
TDD: Trace Knowledge Panel Data Flow
Tests each step of the data flow to find where it breaks
"""

import requests

def test_knowledge_dataflow():
    """Trace the complete data flow step by step"""
    print("🔍 TDD: Knowledge Panel Data Flow Trace\n")
    
    print("📋 Expected Data Flow:")
    print("   1. Knowledge Panel → calls backend API")
    print("   2. Backend API → queries Neo4j database") 
    print("   3. Neo4j → returns page nodes/relationships")
    print("   4. Backend API → formats as JSON response")
    print("   5. Knowledge Panel → receives data")
    print("   6. Visualization Service → renders graph")
    
    print(f"\n🧪 Testing Each Step:")
    
    # Step 1: Test what API endpoint Knowledge Panel should call
    print("1. Testing expected API endpoints...")
    
    endpoints_to_test = [
        "/api/v1/graph/overview",
        "/api/v1/graph", 
        "/api/v1/pages",
        "/api/v1/knowledge",
        "/api/v1/knowledge/graph"
    ]
    
    working_endpoints = []
    for endpoint in endpoints_to_test:
        try:
            response = requests.get(f"http://localhost:8000{endpoint}", timeout=5)
            if response.status_code == 200:
                data = response.json()
                if data.get("success"):
                    working_endpoints.append(endpoint)
                    print(f"   ✅ {endpoint}: {response.status_code}")
                else:
                    print(f"   ⚠️  {endpoint}: {response.status_code} (no success)")
            else:
                print(f"   ❌ {endpoint}: {response.status_code}")
        except Exception as e:
            print(f"   ❌ {endpoint}: {str(e)[:50]}...")
    
    # Step 2: Test the most promising endpoint in detail
    if working_endpoints:
        best_endpoint = working_endpoints[0]
        print(f"\n2. Testing data format from {best_endpoint}...")
        
        try:
            response = requests.get(f"http://localhost:8000{best_endpoint}", timeout=5)
            data = response.json()
            
            # Check data structure
            if "data" in data:
                graph_data = data["data"]
                nodes = graph_data.get("nodes", [])
                edges = graph_data.get("edges", [])
                
                print(f"   ✅ Response format: {{success: {data.get('success')}, data: {{nodes: {len(nodes)}, edges: {len(edges)}}}}}")
                
                # Check if nodes have required fields for visualization
                if nodes:
                    sample_node = nodes[0]
                    viz_fields = ["id", "url", "title", "domain"]
                    available_fields = [f for f in viz_fields if f in sample_node]
                    missing_fields = [f for f in viz_fields if f not in sample_node]
                    
                    print(f"   ✅ Node fields available: {available_fields}")
                    if missing_fields:
                        print(f"   ⚠️  Node fields missing: {missing_fields}")
                
                # Check if we have relationships
                if edges:
                    sample_edge = edges[0]
                    print(f"   ✅ Edge format: {list(sample_edge.keys())}")
                else:
                    print(f"   ⚠️  No relationships found (edges: 0)")
                    
            else:
                print(f"   ❌ Unexpected response format: {list(data.keys())}")
                
        except Exception as e:
            print(f"   ❌ Data format test failed: {e}")
    
    # Step 3: Check what Knowledge Panel is actually calling
    print(f"\n3. Knowledge Panel API Integration Check:")
    print(f"   Expected: Knowledge Panel should call {working_endpoints[0] if working_endpoints else 'UNKNOWN'}")
    print(f"   Reality: Check browser Network tab when opening Knowledge Panel")
    print(f"   Issue: If no API calls visible, Knowledge Panel isn't calling backend")
    
    # Step 4: Identify likely issues
    print(f"\n📋 Likely Issues to Check:")
    print(f"   1. Knowledge Panel not calling any API (check loadKnowledgeData method)")
    print(f"   2. Knowledge Panel calling wrong endpoint")
    print(f"   3. API call failing silently (check error handling)")
    print(f"   4. Data received but not passed to visualization")
    print(f"   5. Visualization service not rendering data")
    
    print(f"\n🔧 Next TDD Steps:")
    print(f"   1. Check Knowledge Panel loadKnowledgeData() method")
    print(f"   2. Add console.log to trace API calls")
    print(f"   3. Test visualization service separately")
    print(f"   4. Fix the broken link in the chain")

if __name__ == "__main__":
    test_knowledge_dataflow()
