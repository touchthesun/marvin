#!/usr/bin/env python3
"""
TDD: Debug Knowledge Panel JavaScript Errors
"""

import requests

def test_knowledge_panel_errors():
    """Test to identify specific JavaScript errors"""
    print("🔍 TDD: Knowledge Panel Error Investigation\n")
    
    print("📋 Console Error Analysis:")
    print("   - 'Error saving active panel: [TypeError]' - Panel switching issue")
    print("   - 'Error getting API URL from storage: [TypeError]' - Storage/config issue") 
    print("   - 'Error persisting state: [TypeError]' - State management issue")
    
    print(f"\n🧪 Testing API Service Integration:")
    
    # Test if the API service can actually make requests
    print("1. Testing if backend is accessible...")
    try:
        response = requests.get("http://localhost:8000/api/v1/graph/overview", timeout=5)
        if response.status_code == 200:
            data = response.json()
            print(f"   ✅ Backend API works: {len(data['data']['nodes'])} nodes")
        else:
            print(f"   ❌ Backend API failed: {response.status_code}")
    except Exception as e:
        print(f"   ❌ Backend connection error: {e}")
    
    print(f"\n2. Likely JavaScript Issues:")
    print(f"   - ApiService.fetchAPI() may be failing")
    print(f"   - Storage access errors preventing API calls")
    print(f"   - Knowledge Panel error handling not working")
    
    print(f"\n🔧 Debug Strategy:")
    print(f"   1. Add console.log to Knowledge Panel loadKnowledgeData()")
    print(f"   2. Add console.log to ApiService.getGraphOverview()")
    print(f"   3. Check if API calls are being made at all")
    print(f"   4. Fix the specific TypeError causing failures")
    
    print(f"\n📋 Expected Fix:")
    print(f"   - Add error logging to see exact TypeError")
    print(f"   - Fix storage/config issues")
    print(f"   - Ensure Knowledge Panel can call API successfully")

if __name__ == "__main__":
    test_knowledge_panel_errors()
