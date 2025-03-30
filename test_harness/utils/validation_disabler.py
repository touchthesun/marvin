class ValidationDisabler:
    """A utility class to temporarily disable validation for testing."""
    
    def __init__(self, logger, stage_name):
        self.logger = logger
        self.stage_name = stage_name
        self.original_validate = None
        self.component_coordinator = None
    
    def _find_validation_method(self, pipeline):
        """Find the validation method in the pipeline structure."""
        if pipeline is None:
            return None, None
            
        # Check different possible pipeline structures
        if hasattr(pipeline, 'context') and hasattr(pipeline.context, 'component_coordinator'):
            component_coordinator = pipeline.context.component_coordinator
            if hasattr(component_coordinator, 'validate_stage'):
                return component_coordinator, component_coordinator.validate_stage
                
        elif hasattr(pipeline, 'component_coordinator'):
            component_coordinator = pipeline.component_coordinator
            if hasattr(component_coordinator, 'validate_stage'):
                return component_coordinator, component_coordinator.validate_stage
                
        elif hasattr(pipeline, 'validate_stage'):
            return pipeline, pipeline.validate_stage
            
        return None, None
    
    def disable_validation(self, pipeline):
        """Disable validation for the specified stage."""
        self.component_coordinator, self.original_validate = self._find_validation_method(pipeline)
        
        if not self.component_coordinator or not self.original_validate:
            self.logger.warning(f"Could not locate validation method in pipeline")
            return False
            
        # Create a new validation method that bypasses the specified stage
        self.component_coordinator.validate_stage = self._create_bypass_validator()
        self.logger.info(f"Disabled validation for stage: {self.stage_name}")
        return True
    
    def restore_validation(self):
        """Restore the original validation method."""
        if self.component_coordinator and self.original_validate:
            self.component_coordinator.validate_stage = self.original_validate
            self.logger.info(f"Restored validation for stage: {self.stage_name}")
    
    def _create_bypass_validator(self):
        """Create a validation function that bypasses the specified stage."""
        original_validate = self.original_validate
        stage_name = self.stage_name
        logger = self.logger
        
        # Define validation bypass method
        async def bypass_validator(page, stage):
            # If stage is a string, compare directly
            if isinstance(stage, str) and stage == stage_name:
                logger.debug(f"Bypassing validation for {stage_name} stage")
                return True
                
            # If stage is an enum, compare value
            elif hasattr(stage, 'value') and stage.value == stage_name:
                logger.debug(f"Bypassing validation for {stage_name} stage")
                return True
                
            # Call original for other stages
            return await original_validate(page, stage)
            
        return bypass_validator