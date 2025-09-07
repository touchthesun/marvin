#!/usr/bin/env python3
"""
TDD Investigation: Why is the status condition failing?
Tests the exact status values and condition logic
"""

import requests
import json
from datetime import datetime

def test_status_condition_investigation():
    """Investigate the exact status values and condition logic"""
    print("🔍 TDD Investigation: Status Condition Failure\n")
    
    # Test 1: What status does the API actually return?
    print("1. Testing actual status returned by page creation API")
    unique_url = f"https://status-test-{datetime.now().timestamp()}.com"
    payload = {"url": unique_url, "context": "active_tab"}
    
    response = requests.post("http://localhost:8000/api/v1/pages/", json=payload)
    
    if response.status_code != 200:
        print(f"   ❌ Page creation failed: {response.status_code}")
        return False
    
    data = response.json()["data"]
    actual_status = data["status"]
    print(f"   📊 Actual status returned: '{actual_status}' (type: {type(actual_status)})")
    
    # Test 2: What would the condition check?
    print(f"\n2. Testing condition logic")
    print(f"   Condition: result.status.value == 'discovered'")
    print(f"   Left side would be: '{actual_status}'")
    print(f"   Right side is: 'discovered'")
    print(f"   Equality check: {actual_status == 'discovered'}")
    
    # Test 3: Check if it's a case sensitivity issue
    print(f"\n3. Testing case sensitivity")
    print(f"   Lower case comparison: {actual_status.lower() == 'discovered'}")
    print(f"   Upper case comparison: {actual_status.upper() == 'DISCOVERED'}")
    
    # Test 4: Check for whitespace issues
    print(f"\n4. Testing whitespace issues")
    print(f"   Stripped comparison: '{actual_status.strip()}' == 'discovered': {actual_status.strip() == 'discovered'}")
    print(f"   Length: {len(actual_status)} vs {len('discovered')}")
    
    # Test 5: Check the raw response structure
    print(f"\n5. Raw response analysis")
    print(f"   Full status field: {repr(actual_status)}")
    print(f"   Status in metadata: {data.get('metadata', {}).get('status', 'NOT_FOUND')}")
    
    # Test 6: Test with existing page (should not be discovered)
    print(f"\n6. Testing with existing page (should not be 'discovered')")
    response2 = requests.post("http://localhost:8000/api/v1/pages/", json=payload)  # Same URL
    if response2.status_code == 200:
        data2 = response2.json()["data"]
        existing_status = data2["status"]
        print(f"   Existing page status: '{existing_status}'")
        print(f"   Different from first call: {existing_status != actual_status}")
    
    # Summary
    print(f"\n📋 Investigation Summary:")
    print(f"   - API returns status: '{actual_status}'")
    print(f"   - Expected status: 'discovered'")
    print(f"   - Condition would pass: {actual_status == 'discovered'}")
    
    if actual_status == "discovered":
        print(f"   ✅ Status condition should work - issue is elsewhere")
        return True
    else:
        print(f"   ❌ Status condition will fail - this is the root cause")
        return False

if __name__ == "__main__":
    test_status_condition_investigation()
