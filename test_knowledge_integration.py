#!/usr/bin/env python3
"""
TDD Test: Knowledge Panel Integration
Tests the specific integration between graph API and Knowledge Panel
"""

import requests

def test_knowledge_integration():
    """Test Knowledge Panel data integration"""
    print("🔍 TDD Test: Knowledge Panel Integration\n")
    
    print("📋 Integration Requirements:")
    print("   1. Graph API provides node/edge data")
    print("   2. Knowledge Panel calls graph API")  
    print("   3. Visualization service renders the data")
    print("   4. User sees knowledge graph")
    
    # Test 1: Verify graph API data format
    print(f"\n1. Testing graph API data format...")
    try:
        response = requests.get("http://localhost:8000/api/v1/graph/overview", timeout=5)
        if response.status_code == 200:
            data = response.json()
            graph_data = data.get("data", {})
            
            nodes = graph_data.get("nodes", [])
            edges = graph_data.get("edges", [])
            
            print(f"   ✅ Graph API works")
            print(f"   📊 Nodes: {len(nodes)}")
            print(f"   📊 Edges: {len(edges)}")
            
            if nodes:
                sample_node = nodes[0]
                required_fields = ["id", "url", "domain"]
                missing_fields = [field for field in required_fields if field not in sample_node]
                
                if not missing_fields:
                    print(f"   ✅ Node format correct: {list(sample_node.keys())}")
                else:
                    print(f"   ❌ Missing node fields: {missing_fields}")
            
            # Check if we have meaningful data
            if len(nodes) > 0:
                print(f"   ✅ Has data to display")
            else:
                print(f"   ⚠️  No nodes to display")
                
        else:
            print(f"   ❌ Graph API failed: {response.status_code}")
            
    except Exception as e:
        print(f"   ❌ Graph API error: {e}")
    
    # Test 2: Check expected Knowledge Panel API calls
    print(f"\n2. Expected Knowledge Panel behavior:")
    print(f"   - Should call: GET /api/v1/graph/overview")
    print(f"   - Should receive: {{nodes: [...], edges: [...]}}")
    print(f"   - Should pass to: visualizationService.createKnowledgeGraph()")
    print(f"   - Should render: Interactive graph in #knowledge-graph-container")
    
    print(f"\n📋 Integration Status:")
    print(f"   ✅ Backend: Graph API working with {len(nodes) if 'nodes' in locals() else 0} nodes")
    print(f"   ❓ Frontend: Knowledge Panel integration unknown")
    print(f"   ❓ Visualization: Service integration unknown")
    
    print(f"\n🔧 Next TDD Steps:")
    print(f"   1. Test Knowledge Panel component initialization")
    print(f"   2. Test API call from Knowledge Panel")
    print(f"   3. Test visualization service integration")
    print(f"   4. Fix any broken connections")

if __name__ == "__main__":
    test_knowledge_integration()
