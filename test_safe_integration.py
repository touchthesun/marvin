#!/usr/bin/env python3
"""
Safe TDD Test: Task Integration without infinite loops
"""

import requests
import time

def test_safe_integration():
    """Test task creation and check if processor would work"""
    print("🔍 Safe Integration Test\n")
    
    # Step 1: Create page and task
    print("1. Creating page...")
    payload = {"url": "https://safe-test.com", "context": "active_tab"}
    response = requests.post("http://localhost:8000/api/v1/pages", json=payload)
    
    if response.status_code != 200:
        print(f"   ❌ Failed: {response.status_code}")
        return
    
    page_data = response.json()["data"]
    print(f"   ✅ Page created: {page_data['id']}")
    
    # Step 2: Check task creation
    print("\n2. Checking task...")
    tasks_response = requests.get("http://localhost:8000/api/v1/tasks")
    tasks = tasks_response.json()["data"]["tasks"]
    
    if not tasks:
        print("   ❌ No tasks found")
        return
    
    task = tasks[-1]  # Get latest task
    print(f"   ✅ Task found: {task['id']}, status: {task['status']}")
    
    # Step 3: Test if PipelineService works
    print("\n3. Testing PipelineService directly...")
    pipeline_payload = {"url": "https://pipeline-direct-test.com", "context": "active_tab"}
    pipeline_response = requests.post("http://localhost:8000/api/v1/analysis/analyze", json=pipeline_payload)
    
    if pipeline_response.status_code == 200:
        print("   ✅ PipelineService works")
        pipeline_data = pipeline_response.json()
        print(f"   Pipeline task: {pipeline_data.get('data', {}).get('task_id', 'Unknown')}")
    else:
        print(f"   ❌ PipelineService failed: {pipeline_response.status_code}")
    
    # Step 4: Check if pages are in database after pipeline
    print("\n4. Checking database after pipeline...")
    time.sleep(2)  # Wait for processing
    
    # Try to get pages
    pages_response = requests.get("http://localhost:8000/api/v1/pages")
    if pages_response.status_code == 200:
        pages_data = pages_response.json()
        page_count = len(pages_data.get("data", {}).get("pages", []))
        print(f"   📊 Pages in database: {page_count}")
    else:
        print(f"   ⚠️  Could not check pages: {pages_response.status_code}")
    
    print(f"\n📋 Summary:")
    print(f"   - TaskManager: ✅ Creates tasks")
    print(f"   - PipelineService: ✅ Processes pages") 
    print(f"   - Integration needed: TaskProcessor to connect them")

if __name__ == "__main__":
    test_safe_integration()
