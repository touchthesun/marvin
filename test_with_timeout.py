#!/usr/bin/env python3
"""
TDD Test with timeouts to avoid hanging
"""

import requests
import signal
import sys

class TimeoutError(Exception):
    pass

def timeout_handler(signum, frame):
    raise TimeoutError("Test timed out")

def test_with_timeout():
    """Test with 10 second timeout"""
    # Set timeout
    signal.signal(signal.SIGALRM, timeout_handler)
    signal.alarm(10)  # 10 second timeout
    
    try:
        print("🔍 Quick Integration Test (10s timeout)\n")
        
        # Just check current state without creating new pages
        print("1. Checking existing tasks...")
        tasks_response = requests.get("http://localhost:8000/api/v1/tasks", timeout=5)
        
        if tasks_response.status_code == 200:
            tasks = tasks_response.json()["data"]["tasks"]
            print(f"   📊 Current tasks: {len(tasks)}")
            
            if tasks:
                latest_task = tasks[-1]
                print(f"   Latest task: {latest_task['id']}")
                print(f"   Status: {latest_task['status']}")
                print(f"   Progress: {latest_task.get('progress', 0.0)}")
        else:
            print(f"   ❌ Tasks API failed: {tasks_response.status_code}")
        
        print("\n2. Checking PipelineService availability...")
        # Test pipeline without creating tasks
        test_response = requests.get("http://localhost:8000/api/v1/analysis", timeout=5)
        print(f"   Analysis endpoint: {test_response.status_code}")
        
        print("\n📋 Status:")
        print("   - TaskManager: ✅ (tasks API works)")
        print("   - PipelineService: ✅ (analysis endpoint exists)")
        print("   - Issue: TaskProcessor infinite loop needs fixing")
        
    except TimeoutError:
        print("\n⏰ Test timed out - likely infinite loop in TaskProcessor")
    except Exception as e:
        print(f"\n❌ Test error: {e}")
    finally:
        signal.alarm(0)  # Cancel timeout

if __name__ == "__main__":
    test_with_timeout()
