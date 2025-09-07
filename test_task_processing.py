#!/usr/bin/env python3
"""
TDD Investigation: Why tasks are created but never processed
"""

import requests
import json
import time
from datetime import datetime

def test_task_processing_pipeline():
    """Test the complete task processing pipeline"""
    print("🔍 TDD Investigation: Task Processing Pipeline\n")
    
    # Step 1: Create a page and task
    print("1. Creating page to trigger task...")
    unique_url = f"https://pipeline-test-{datetime.now().timestamp()}.com"
    payload = {"url": unique_url, "context": "active_tab"}
    
    page_response = requests.post("http://localhost:8000/api/v1/pages", json=payload)
    if page_response.status_code != 200:
        print(f"   ❌ Page creation failed: {page_response.status_code}")
        return False
    
    page_data = page_response.json()["data"]
    page_id = page_data["id"]
    print(f"   ✅ Page created: {page_id}")
    
    # Step 2: Check if task was created
    print("\n2. Checking if task was created...")
    tasks_response = requests.get("http://localhost:8000/api/v1/tasks")
    tasks = tasks_response.json()["data"]["tasks"]
    
    # Find our task
    our_task = None
    for task in tasks:
        if task.get("data", {}).get("page_id") == page_id:
            our_task = task
            break
    
    if not our_task:
        print(f"   ❌ No task found for page {page_id}")
        return False
    
    task_id = our_task["id"]
    initial_status = our_task["status"]
    print(f"   ✅ Task found: {task_id}, status: {initial_status}")
    
    # Step 3: Wait and check if task progresses
    print(f"\n3. Monitoring task progress for 10 seconds...")
    for i in range(10):
        time.sleep(1)
        
        # Check task status
        task_response = requests.get(f"http://localhost:8000/api/v1/tasks/{task_id}")
        if task_response.status_code == 200:
            task_data = task_response.json()["data"]
            current_status = task_data["status"]
            progress = task_data.get("progress", 0.0)
            print(f"   [{i+1}s] Status: {current_status}, Progress: {progress}")
            
            if current_status != initial_status:
                print(f"   ✅ Task status changed from {initial_status} to {current_status}")
                break
        else:
            print(f"   ⚠️  Could not fetch task status: {task_response.status_code}")
    else:
        print(f"   ❌ Task status never changed from {initial_status}")
    
    # Step 4: Check if page was written to database
    print(f"\n4. Checking if page was written to database...")
    
    # Try to fetch the page
    page_fetch_response = requests.get(f"http://localhost:8000/api/v1/pages/{page_id}")
    if page_fetch_response.status_code == 200:
        fetched_page = page_fetch_response.json()["data"]
        print(f"   ✅ Page found in database: {fetched_page['id']}")
        print(f"   Status: {fetched_page['status']}")
        print(f"   Title: {fetched_page.get('title', 'None')}")
        print(f"   Content length: {len(fetched_page.get('content', '') or '')}")
    else:
        print(f"   ❌ Page not found in database: {page_fetch_response.status_code}")
    
    # Step 5: Check final task status
    print(f"\n5. Final task status check...")
    final_task_response = requests.get(f"http://localhost:8000/api/v1/tasks/{task_id}")
    if final_task_response.status_code == 200:
        final_task = final_task_response.json()["data"]
        print(f"   Final status: {final_task['status']}")
        print(f"   Final progress: {final_task.get('progress', 0.0)}")
        print(f"   Message: {final_task.get('message', 'None')}")
        if final_task.get('error'):
            print(f"   Error: {final_task['error']}")
    
    print(f"\n📋 Investigation Summary:")
    print(f"   - Page created: ✅")
    print(f"   - Task created: ✅") 
    print(f"   - Task processing: {'❌ STUCK' if initial_status == 'enqueued' else '✅'}")
    print(f"   - Database write: {'❌ FAILED' if page_fetch_response.status_code != 200 else '✅'}")
    
    return False  # Always return False since we're investigating a broken system

if __name__ == "__main__":
    test_task_processing_pipeline()
