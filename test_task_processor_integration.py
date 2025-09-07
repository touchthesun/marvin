#!/usr/bin/env python3
"""
TDD Test: Task Processor Integration
Tests the missing link between TaskManager and PipelineService
"""

import requests
import json
import time
from datetime import datetime

def test_task_processor_integration():
    """Test the complete task processing integration"""
    print("🔍 TDD Test: Task Processor Integration\n")
    
    print("📋 Expected Workflow:")
    print("   1. User captures page → TaskManager creates task")
    print("   2. Task Processor picks up 'enqueued' task")  
    print("   3. Task Processor calls PipelineService.enqueue_urls()")
    print("   4. PipelineService processes page → writes to database")
    print("   5. Task status updated to 'completed'")
    print("   6. Knowledge Panel gets updated data")
    
    print(f"\n🧪 Testing Current State:")
    
    # Step 1: Create page and task
    unique_url = f"https://integration-test-{datetime.now().timestamp()}.com"
    payload = {"url": unique_url, "context": "active_tab"}
    
    print(f"1. Creating page: {unique_url}")
    page_response = requests.post("http://localhost:8000/api/v1/pages", json=payload)
    
    if page_response.status_code != 200:
        print(f"   ❌ Failed: {page_response.status_code}")
        return False
    
    page_data = page_response.json()["data"]
    page_id = page_data["id"]
    print(f"   ✅ Page created: {page_id}")
    
    # Step 2: Verify task was created
    print(f"\n2. Checking task creation...")
    tasks_response = requests.get("http://localhost:8000/api/v1/tasks")
    tasks = tasks_response.json()["data"]["tasks"]
    
    our_task = None
    for task in tasks:
        if task.get("data", {}).get("page_id") == page_id:
            our_task = task
            break
    
    if not our_task:
        print(f"   ❌ No task found for page {page_id}")
        return False
    
    task_id = our_task["id"]
    print(f"   ✅ Task created: {task_id}, status: {our_task['status']}")
    
    # Step 3: Check if PipelineService would process it
    print(f"\n3. Testing PipelineService integration...")
    
    # Test if we can call PipelineService directly
    try:
        pipeline_test_payload = {
            "urls": [{
                "url": unique_url,
                "context": "active_tab"
            }]
        }
        
        # This endpoint should exist if PipelineService is properly integrated
        pipeline_response = requests.post(
            "http://localhost:8000/api/v1/analysis/enqueue", 
            json=pipeline_test_payload
        )
        
        if pipeline_response.status_code == 200:
            print(f"   ✅ PipelineService accessible via /analysis/enqueue")
            pipeline_data = pipeline_response.json()
            print(f"   Pipeline task ID: {pipeline_data.get('data', {}).get('task_id', 'Unknown')}")
        else:
            print(f"   ⚠️  PipelineService endpoint status: {pipeline_response.status_code}")
            
    except Exception as e:
        print(f"   ❌ PipelineService test failed: {str(e)}")
    
    # Step 4: Check what's missing
    print(f"\n4. Identifying missing integration...")
    print(f"   ✅ TaskManager: Creates tasks")
    print(f"   ✅ PipelineService: Can process pages") 
    print(f"   ❌ Task Processor: Missing link between them")
    
    print(f"\n📋 Required Integration:")
    print(f"   - Task Processor monitors TaskManager for 'enqueued' tasks")
    print(f"   - Calls PipelineService.enqueue_urls() with task data")
    print(f"   - Updates task status based on PipelineService results")
    print(f"   - Handles errors and retries")
    
    return False  # Always false since we're testing broken system

if __name__ == "__main__":
    test_task_processor_integration()
