import uvicorn
import os
from api.config import settings
from core.utils.config import load_config

if __name__ == "__main__":
    # Load core configuration to make environment variables available
    config = load_config()
    
    # Set critical environment variables if they're provided in the config
    # but not already in the environment
    if config.get("secret_key") and not os.environ.get("SECRET_KEY"):
        os.environ["SECRET_KEY"] = config["secret_key"]
    
    if config.get("admin_token") and not os.environ.get("ADMIN_TOKEN"):
        os.environ["ADMIN_TOKEN"] = config["admin_token"]
        
    # Print confirmation for debugging
    print(f"Admin token available: {'Yes' if os.environ.get('ADMIN_TOKEN') else 'No'}")
    print(f"Secret key available: {'Yes' if os.environ.get('SECRET_KEY') else 'No'}")
    
    # Run the server
    uvicorn.run(
        "api.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.RELOAD,
        log_level="debug" if settings.DEBUG else "info"
    )
