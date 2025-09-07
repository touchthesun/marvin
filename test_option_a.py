#!/usr/bin/env python3
"""
TDD Test for Option A: Proper Dependency Injection Fix
Tests the fix before and after implementation
"""

import requests
import json
from datetime import datetime

def test_current_state():
    """Test current broken state - should fail"""
    print("🧪 Testing CURRENT state (should fail)")
    
    # Get initial task count
    response = requests.get("http://localhost:8000/api/v1/tasks")
    initial_count = len(response.json()["data"]["tasks"])
    print(f"   Initial task count: {initial_count}")
    
    # Create page
    unique_url = f"https://tdd-option-a-{datetime.now().timestamp()}.com"
    payload = {"url": unique_url, "context": "active_tab"}
    
    page_response = requests.post("http://localhost:8000/api/v1/pages/", json=payload)
    
    if page_response.status_code != 200:
        print(f"   ❌ Page creation failed: {page_response.status_code}")
        return False
    
    page_data = page_response.json()["data"]
    print(f"   ✅ Page created: {page_data['id']}, status: {page_data['status']}")
    
    # Check if task was created
    response = requests.get("http://localhost:8000/api/v1/tasks")
    final_count = len(response.json()["data"]["tasks"])
    print(f"   Final task count: {final_count}")
    
    task_created = final_count > initial_count
    print(f"   Task created: {'✅ YES' if task_created else '❌ NO'}")
    
    return task_created, unique_url

def test_fixed_state():
    """Test after implementing Option A fix - should pass"""
    print("\n🧪 Testing FIXED state (should pass)")
    
    # Same test as above
    return test_current_state()[0]

def main():
    print("🔬 TDD Test for Option A: Proper Dependency Injection\n")
    
    # Test current broken state
    current_works, test_url = test_current_state()
    
    if current_works:
        print("\n⚠️  WARNING: Current state already works! No fix needed.")
        return
    
    print(f"\n✅ Confirmed: Current state is broken (expected)")
    print(f"📝 Test URL for verification: {test_url}")
    print("\n🔧 Ready to implement Option A fix...")
    print("   After implementing fix, run this test again to verify")

if __name__ == "__main__":
    main()
