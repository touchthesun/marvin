from core.utils.logger import get_logger
from test_harness.scenarios.base import TestScenario

class AuthProviderScenario(TestScenario):
    """
    Tests the authentication and credential management flow.
    
    This scenario validates that:
    1. Provider credentials can be stored securely
    2. Providers can be listed and retrieved
    3. LLM providers can initialize using stored credentials
    4. Credentials can be removed securely
    """
    
    async def setup(self):
        """Set up the scenario prerequisites."""
        self.logger.info("Setting up Auth Provider scenario")
        
        # Ensure clean state
        await self.components["api"].reset_auth_state()
        
        # Set up admin credentials
        self.admin_token = self.components["api"].get_admin_token()
        self.logger.info(f"Using admin token: {self.admin_token}")
    
    async def execute(self):
        """
        Execute the auth provider scenario.
        
        Returns:
            Dictionary of test results
        """
        self.logger.info("Executing Auth Provider scenario")
        results = {}
        
        # 1. Get provider types
        with self.timed_operation("get_provider_types"):
            provider_types_response = await self.components["api"].send_request(
                "GET", 
                "/auth/provider-types"
            )
        
        results["provider_types_response"] = provider_types_response
        
        # 2. Create provider credentials
        test_providers = self.test_data.get("providers", [
            {
                "provider_id": "test-anthropic",
                "provider_type": "anthropic",
                "credentials": {
                    "api_key": "test-api-key-1",
                    "api_base": "https://api.anthropic.com/v1",
                    "model": "claude-3-opus-20240229"
                }
            },
            {
                "provider_id": "test-ollama",
                "provider_type": "ollama",
                "credentials": {
                    "api_base": "http://localhost:11434",
                    "model": "llama2"
                }
            }
        ])
        
        # IMPORTANT: Log the token we're using for debugging
        self.logger.info(f"Using admin token for auth: {self.admin_token}")
        
        create_responses = []
        for provider in test_providers:
            with self.timed_operation(f"create_provider_{provider['provider_id']}"):
                create_response = await self.components["api"].send_request(
                    "POST", 
                    "/auth/providers", 
                    provider,
                    headers={"Authorization": f"Bearer {self.admin_token}"}
                )
            
            create_responses.append({
                "provider": provider,
                "response": create_response
            })
        
        results["create_responses"] = create_responses
        
        # 3. List providers
        with self.timed_operation("list_providers"):
            list_response = await self.components["api"].send_request(
                "GET", 
                "/auth/providers",  # Remove /api/v1 prefix
                headers={"Authorization": f"Bearer {self.admin_token}"}
            )
        
        results["list_response"] = list_response
        
        # 4. Get provider details
        get_responses = []
        for provider in test_providers:
            provider_id = provider["provider_id"]
            with self.timed_operation(f"get_provider_{provider_id}"):
                get_response = await self.components["api"].send_request(
                    "GET", 
                    f"/auth/providers/{provider_id}",  # Remove /api/v1 prefix
                    headers={"Authorization": f"Bearer {self.admin_token}"}
                )
            
            get_responses.append({
                "provider_id": provider_id,
                "response": get_response
            })
        
        results["get_responses"] = get_responses
        
        # 5. Test LLM provider initialization
        init_responses = []
        for provider in test_providers:
            provider_id = provider["provider_id"]
            with self.timed_operation(f"init_provider_{provider_id}"):
                # Make sure initialization data is correctly structured
                init_data = {"provider_id": provider_id}
                self.logger.debug(f"Initializing provider {provider_id} with data: {init_data}")
                
                init_response = await self.components["api"].send_request(
                    "POST", 
                    "/llm/initialize",  # Remove /api/v1 prefix
                    init_data,
                    headers={"Authorization": f"Bearer {self.admin_token}"}
                )
            
            init_responses.append({
                "provider_id": provider_id,
                "response": init_response
            })
        
        results["init_responses"] = init_responses
        
        # 6. Token validation
        with self.timed_operation("validate_token"):
            # Make sure validation data is correctly structured
            validate_data = {"session_token": self.admin_token}
            self.logger.debug("Validating token with data: {validate_data}")
            
            validate_response = await self.components["api"].send_request(
                "POST", 
                "/auth/validate",  # Remove /api/v1 prefix
                validate_data
            )
        
        results["validate_response"] = validate_response
        
        # 7. Invalid token validation
        with self.timed_operation("validate_invalid_token"):
            # Make sure validation data is correctly structured
            invalid_token_data = {"session_token": "invalid-token"}
            
            invalid_validate_response = await self.components["api"].send_request(
                "POST", 
                "/auth/validate",  # Remove /api/v1 prefix
                invalid_token_data
            )
        
        results["invalid_validate_response"] = invalid_validate_response
        
        # 8. Remove provider credentials
        remove_responses = []
        for provider in test_providers:
            provider_id = provider["provider_id"]
            with self.timed_operation(f"remove_provider_{provider_id}"):
                remove_response = await self.components["api"].send_request(
                    "DELETE", 
                    f"/auth/providers/{provider_id}",  # Remove /api/v1 prefix
                    headers={"Authorization": f"Bearer {self.admin_token}"}
                )
            
            remove_responses.append({
                "provider_id": provider_id,
                "response": remove_response
            })
        
        results["remove_responses"] = remove_responses
        
        # 9. Verify removal
        with self.timed_operation("verify_removal"):
            verify_list_response = await self.components["api"].send_request(
                "GET", 
                "/auth/providers",  # Remove /api/v1 prefix
                headers={"Authorization": f"Bearer {self.admin_token}"}
            )
        
        results["verify_list_response"] = verify_list_response
        
        return results
    
    async def validate(self, results):
        """
        Validate the scenario results.
        
        Args:
            results: Dictionary of results from execute()
            
        Returns:
            List of assertions
        """
        self.logger.info("Validating Auth Provider scenario results")
        assertions = []
        
        # 1. Check provider types
        provider_types = results.get("provider_types_response", {}).get("data", {})
        assertions.append(self.create_assertion(
            "provider_types_available",
            len(provider_types) > 0,
            "Provider types should be available"
        ))
        
        assertions.append(self.create_assertion(
            "anthropic_provider_type",
            "anthropic" in provider_types,
            "Anthropic provider type should be available"
        ))
        
        # 2. Check provider creation
        for i, create_result in enumerate(results.get("create_responses", [])):
            provider = create_result["provider"]
            response = create_result["response"]
            
            assertions.append(self.create_assertion(
                f"create_provider_{i}",
                response.get("success", False) is True,
                f"Provider {provider['provider_id']} should be created successfully"
            ))
        
        # 3. Check provider listing
        list_data = results.get("list_response", {}).get("data", {})
        assertions.append(self.create_assertion(
            "providers_listed",
            len(list_data) > 0,
            "Providers should be listed"
        ))
        
        for i, create_result in enumerate(results.get("create_responses", [])):
            provider = create_result["provider"]
            provider_id = provider["provider_id"]
            
            assertions.append(self.create_assertion(
                f"provider_in_list_{i}",
                provider_id in list_data,
                f"Provider {provider_id} should be in the provider list"
            ))
        
        # 4. Check provider details
        for i, get_result in enumerate(results.get("get_responses", [])):
            provider_id = get_result["provider_id"]
            response = get_result["response"]
            
            assertions.append(self.create_assertion(
                f"get_provider_{i}",
                response.get("success", False) is True,
                f"Provider {provider_id} details should be retrievable"
            ))
            
            # Check credential masking
            provider_data = response.get("data", {})
            has_credential_keys = "credential_keys" in provider_data
            assertions.append(self.create_assertion(
                f"credential_keys_{i}",
                has_credential_keys,
                f"Provider {provider_id} should have credential keys listed"
            ))
            
            # Ensure API key is not returned directly
            credential_keys = provider_data.get("credential_keys", [])
            assertions.append(self.create_assertion(
                f"credential_masking_{i}",
                "api_key" not in provider_data,
                f"API key for {provider_id} should not be returned directly"
            ))
        
        # 5. Check LLM initialization
        for i, init_result in enumerate(results.get("init_responses", [])):
            provider_id = init_result["provider_id"]
            response = init_result["response"]
            
            assertions.append(self.create_assertion(
                f"init_provider_{i}",
                response.get("success", False) is True,
                f"Provider {provider_id} should initialize successfully"
            ))
        
        # 6. Check token validation
        valid_token = results.get("validate_response", {})
        assertions.append(self.create_assertion(
            "valid_token",
            valid_token.get("success", False) is True,
            "Valid admin token should be validated successfully"
        ))
        
        # 7. Check invalid token validation
        invalid_token = results.get("invalid_validate_response", {})
        assertions.append(self.create_assertion(
            "invalid_token",
            invalid_token.get("success", False) is False,
            "Invalid token should fail validation"
        ))
        
        # 8. Check provider removal
        for i, remove_result in enumerate(results.get("remove_responses", [])):
            provider_id = remove_result["provider_id"]
            response = remove_result["response"]
            
            assertions.append(self.create_assertion(
                f"remove_provider_{i}",
                response.get("success", False) is True,
                f"Provider {provider_id} should be removed successfully"
            ))
        
        # 9. Verify providers were removed
        verify_list = results.get("verify_list_response", {}).get("data", {})
        assertions.append(self.create_assertion(
            "providers_removed",
            len(verify_list) == 0,
            "All providers should be removed"
        ))
        
        return assertions