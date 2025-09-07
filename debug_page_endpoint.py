#!/usr/bin/env python3
"""
Debug the page endpoint task creation logic
"""

import requests
import json

def test_page_endpoint_task_creation():
    """Test if page endpoint is actually executing task creation code"""
    
    print("🔍 Debugging page endpoint task creation logic\n")
    
    # Create a page and check server logs
    unique_url = f"https://debug-endpoint-test.com"
    payload = {
        "url": unique_url,
        "context": "active_tab"
    }
    
    print(f"1. Creating page: {unique_url}")
    response = requests.post("http://localhost:8000/api/v1/pages/", json=payload)
    
    if response.status_code == 200:
        data = response.json()["data"]
        print(f"   ✅ Page created: ID={data['id']}, Status={data['status']}")
        
        if data['status'] == 'discovered':
            print("   ✅ Status is 'discovered' - task creation should trigger")
            
            # Check if task was created
            tasks_response = requests.get("http://localhost:8000/api/v1/tasks")
            tasks = tasks_response.json()["data"]["tasks"]
            
            # Look for task with our URL
            matching_tasks = [t for t in tasks if t.get("data", {}).get("url") == unique_url]
            
            if matching_tasks:
                print(f"   ✅ Task created successfully: {matching_tasks[0]['id']}")
                return True
            else:
                print(f"   ❌ No task found for URL {unique_url}")
                print(f"   📊 Total tasks in system: {len(tasks)}")
                if tasks:
                    print("   📋 Existing task URLs:")
                    for task in tasks:
                        task_url = task.get("data", {}).get("url", "No URL")
                        print(f"      - {task_url}")
                return False
        else:
            print(f"   ❌ Status is '{data['status']}', not 'discovered'")
            return False
    else:
        print(f"   ❌ Page creation failed: {response.status_code}")
        print(f"   Response: {response.text}")
        return False

if __name__ == "__main__":
    test_page_endpoint_task_creation()
