#!/usr/bin/env python3
"""
TDD Tests for Page → Task Creation Integration
Isolates the exact failure point in task creation logic
"""

import asyncio
import requests
import json
from datetime import datetime

BASE_URL = "http://localhost:8000/api/v1"

class TaskCreationTester:
    def __init__(self):
        self.test_results = []
    
    def log_test(self, test_name, passed, details=""):
        """Log test result"""
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status}: {test_name}")
        if details:
            print(f"   Details: {details}")
        self.test_results.append({
            "test": test_name,
            "passed": passed,
            "details": details
        })
    
    def test_1_direct_task_creation(self):
        """Test 1: Verify direct task creation works"""
        try:
            payload = {
                "data": {
                    "page_id": f"test-{datetime.now().timestamp()}",
                    "url": "https://test-direct.com",
                    "processing_stage": "content_extraction"
                }
            }
            
            response = requests.post(f"{BASE_URL}/tasks", json=payload)
            success = response.status_code == 200 and response.json().get("success", False)
            
            if success:
                task_id = response.json()["data"]["id"]
                self.log_test("Direct task creation", True, f"Created task {task_id}")
                return task_id
            else:
                self.log_test("Direct task creation", False, f"Status: {response.status_code}, Response: {response.text[:200]}")
                return None
                
        except Exception as e:
            self.log_test("Direct task creation", False, f"Exception: {str(e)}")
            return None
    
    def test_2_page_creation_status(self):
        """Test 2: Verify page creation returns 'discovered' status"""
        try:
            unique_url = f"https://test-page-{datetime.now().timestamp()}.com"
            payload = {
                "url": unique_url,
                "context": "active_tab"
            }
            
            response = requests.post(f"{BASE_URL}/pages/", json=payload)
            success = response.status_code == 200
            
            if success:
                data = response.json()["data"]
                status = data["status"]
                page_id = data["id"]
                
                if status == "discovered":
                    self.log_test("Page creation with discovered status", True, f"Page {page_id} has status '{status}'")
                    return page_id, unique_url
                else:
                    self.log_test("Page creation with discovered status", False, f"Expected 'discovered', got '{status}'")
                    return None, None
            else:
                self.log_test("Page creation with discovered status", False, f"Status: {response.status_code}")
                return None, None
                
        except Exception as e:
            self.log_test("Page creation with discovered status", False, f"Exception: {str(e)}")
            return None, None
    
    def test_3_task_count_before_after(self):
        """Test 3: Check if task count increases after page creation"""
        try:
            # Get initial task count
            response = requests.get(f"{BASE_URL}/tasks")
            initial_count = len(response.json()["data"]["tasks"])
            
            # Create a page
            unique_url = f"https://test-count-{datetime.now().timestamp()}.com"
            payload = {
                "url": unique_url,
                "context": "active_tab"
            }
            
            page_response = requests.post(f"{BASE_URL}/pages/", json=payload)
            page_success = page_response.status_code == 200
            
            if not page_success:
                self.log_test("Task count increase after page creation", False, "Page creation failed")
                return False
            
            # Get final task count
            response = requests.get(f"{BASE_URL}/tasks")
            final_count = len(response.json()["data"]["tasks"])
            
            count_increased = final_count > initial_count
            self.log_test("Task count increase after page creation", count_increased, 
                         f"Initial: {initial_count}, Final: {final_count}")
            
            return count_increased
            
        except Exception as e:
            self.log_test("Task count increase after page creation", False, f"Exception: {str(e)}")
            return False
    
    def test_4_task_data_structure(self):
        """Test 4: Verify created tasks have correct data structure"""
        try:
            response = requests.get(f"{BASE_URL}/tasks")
            tasks = response.json()["data"]["tasks"]
            
            if not tasks:
                self.log_test("Task data structure validation", False, "No tasks found")
                return False
            
            task = tasks[0]  # Check first task
            required_fields = ["id", "status", "data"]
            required_data_fields = ["page_id", "url", "processing_stage"]
            
            # Check top-level fields
            missing_fields = [field for field in required_fields if field not in task]
            if missing_fields:
                self.log_test("Task data structure validation", False, f"Missing fields: {missing_fields}")
                return False
            
            # Check data fields
            task_data = task.get("data", {})
            missing_data_fields = [field for field in required_data_fields if field not in task_data]
            if missing_data_fields:
                self.log_test("Task data structure validation", False, f"Missing data fields: {missing_data_fields}")
                return False
            
            self.log_test("Task data structure validation", True, "All required fields present")
            return True
            
        except Exception as e:
            self.log_test("Task data structure validation", False, f"Exception: {str(e)}")
            return False
    
    def test_5_app_state_task_manager(self):
        """Test 5: Check if task manager is properly initialized in app state"""
        try:
            # This test requires access to the FastAPI app state
            # We'll test indirectly by checking if task creation endpoint works
            payload = {
                "data": {
                    "page_id": "state-test",
                    "url": "https://state-test.com",
                    "processing_stage": "test"
                }
            }
            
            response = requests.post(f"{BASE_URL}/tasks", json=payload)
            success = response.status_code == 200
            
            if success:
                # If task creation works, task manager is initialized
                self.log_test("Task manager initialization", True, "Task manager accessible via API")
                return True
            else:
                self.log_test("Task manager initialization", False, f"Task creation failed: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Task manager initialization", False, f"Exception: {str(e)}")
            return False
    
    def run_all_tests(self):
        """Run all tests and provide summary"""
        print("🧪 Starting TDD Task Creation Tests\n")
        
        # Test 1: Direct task creation
        task_id = self.test_1_direct_task_creation()
        
        # Test 2: Page creation status
        page_id, page_url = self.test_2_page_creation_status()
        
        # Test 3: Task count increase
        count_increased = self.test_3_task_count_before_after()
        
        # Test 4: Task data structure
        data_structure_valid = self.test_4_task_data_structure()
        
        # Test 5: App state task manager
        task_manager_ok = self.test_5_app_state_task_manager()
        
        # Summary
        print(f"\n📊 Test Summary:")
        passed = sum(1 for result in self.test_results if result["passed"])
        total = len(self.test_results)
        print(f"   Passed: {passed}/{total}")
        
        if passed == total:
            print("✅ All tests passed - task creation should be working")
        else:
            print("❌ Some tests failed - investigating root cause:")
            for result in self.test_results:
                if not result["passed"]:
                    print(f"   - {result['test']}: {result['details']}")
        
        return passed == total

if __name__ == "__main__":
    tester = TaskCreationTester()
    tester.run_all_tests()
