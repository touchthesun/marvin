#!/usr/bin/env python3
"""
TDD Investigation: Is the task creation code path being executed at all?
Tests if the code after page creation is running
"""

import requests
import json
from datetime import datetime

def test_code_execution_path():
    """Test if the task creation code path is being executed"""
    print("🔍 TDD Investigation: Code Execution Path\n")
    
    print("1. Adding temporary logging to page endpoint...")
    
    # We need to add a simple log statement that we can detect
    # Let's add it to the page endpoint temporarily
    
    print("   📝 Manual step required:")
    print("   Add this line after 'await tx.commit()' in pages.py:")
    print("   logger.info('🔥 TDD_TEST: Page creation completed, checking status...')")
    print("   Add this line in the if condition:")
    print("   logger.info('🔥 TDD_TEST: Status is discovered, creating task...')")
    print("   Add this line in the except block:")
    print("   logger.error('🔥 TDD_TEST: Task creation failed with error')")
    
    print("\n2. After adding logging, create a page and check server logs")
    print("   Look for '🔥 TDD_TEST:' messages in the server output")
    
    # Create a test page
    unique_url = f"https://execution-test-{datetime.now().timestamp()}.com"
    payload = {"url": unique_url, "context": "active_tab"}
    
    print(f"\n3. Creating test page: {unique_url}")
    response = requests.post("http://localhost:8000/api/v1/pages/", json=payload)
    
    if response.status_code == 200:
        print("   ✅ Page creation request successful")
        print("   📋 Check server logs for TDD_TEST messages to see execution path")
    else:
        print(f"   ❌ Page creation failed: {response.status_code}")
    
    print(f"\n4. Expected log messages:")
    print(f"   - '🔥 TDD_TEST: Page creation completed, checking status...'")
    print(f"   - '🔥 TDD_TEST: Status is discovered, creating task...'")
    print(f"   - Either task creation success or '🔥 TDD_TEST: Task creation failed'")

if __name__ == "__main__":
    test_code_execution_path()
