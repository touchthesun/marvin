#!/usr/bin/env python3
"""
TDD Investigation: Task display issues in Tasks Panel
"""

import requests
import json
import time

def test_task_display_issues():
    """Investigate task naming and timing display issues"""
    print("🔍 TDD Investigation: Task Display Issues\n")
    
    # Create a test task
    print("1. Creating test page to generate task...")
    unique_url = f"https://display-test-{time.time()}.com"
    payload = {"url": unique_url, "context": "active_tab"}
    
    page_response = requests.post("http://localhost:8000/api/v1/pages", json=payload)
    if page_response.status_code != 200:
        print(f"   ❌ Page creation failed: {page_response.status_code}")
        return
    
    page_data = page_response.json()["data"]
    print(f"   ✅ Page created: {page_data['id']}")
    
    # Get the task data
    print("\n2. Examining task data structure...")
    tasks_response = requests.get("http://localhost:8000/api/v1/tasks")
    tasks = tasks_response.json()["data"]["tasks"]
    
    if not tasks:
        print("   ❌ No tasks found")
        return
    
    latest_task = tasks[-1]
    print(f"   📊 Task structure:")
    print(f"   ID: {latest_task['id']}")
    print(f"   Status: {latest_task['status']}")
    print(f"   Message: {latest_task.get('message', 'None')}")
    print(f"   Progress: {latest_task.get('progress', 'None')}")
    print(f"   Created: {latest_task.get('created_at', 'None')}")
    print(f"   Updated: {latest_task.get('updated_at', 'None')}")
    print(f"   Data: {json.dumps(latest_task.get('data', {}), indent=2)}")
    
    # Analyze issues
    print(f"\n3. Issue Analysis:")
    
    # Issue 1: Task naming
    task_data = latest_task.get('data', {})
    task_url = task_data.get('url', 'Unknown')
    print(f"   Issue 1 - Task Name:")
    print(f"   Current: Uses URL '{task_url}'")
    print(f"   Problem: Confusing when multiple pages in task")
    print(f"   Solution: Use 'Capture Task - N pages' format")
    
    # Issue 2: Time display
    created_at = latest_task.get('created_at')
    updated_at = latest_task.get('updated_at')
    print(f"\n   Issue 2 - Time Display:")
    print(f"   Created at: {created_at}")
    print(f"   Updated at: {updated_at}")
    print(f"   Problem: 'Unknown time' suggests missing/invalid timestamps")
    print(f"   Solution: Ensure proper ISO timestamp format")
    
    # Check task completion time calculation
    if created_at and updated_at:
        try:
            import datetime as dt
            created = dt.datetime.fromisoformat(created_at.replace('Z', '+00:00'))
            updated = dt.datetime.fromisoformat(updated_at.replace('Z', '+00:00'))
            duration = (updated - created).total_seconds()
            print(f"   Calculated duration: {duration:.2f} seconds")
        except Exception as e:
            print(f"   ❌ Time calculation error: {e}")
    
    print(f"\n📋 Required Fixes:")
    print(f"   1. TaskManager: Add proper task naming with page count")
    print(f"   2. TaskManager: Ensure timestamps are ISO format")
    print(f"   3. Tasks Panel: Update display logic for new naming")

if __name__ == "__main__":
    test_task_display_issues()
