import uvicorn
import os
import subprocess
import time
from api.config.config import settings
from core.utils.config import load_config
from core.utils.logger import get_logger

logger = get_logger("startup")

def check_neo4j_running():
    """Check if Neo4j container is running, start it if not."""
    try:
        # Check if a container named marvin-neo4j exists (running or stopped)
        result = subprocess.run(
            ["docker", "ps", "-a", "--filter", "name=marvin-neo4j", "--format", "{{.ID}}"],
            capture_output=True,
            text=True,
            check=True
        )
        
        container_id = result.stdout.strip()
        if container_id:
            # Container exists, remove it to ensure clean state
            logger.info(f"Found existing Neo4j container ({container_id}), removing it...")
            subprocess.run(["docker", "stop", container_id], check=False)  # Don't error if already stopped
            subprocess.run(["docker", "rm", container_id], check=True)
        
        # Create a new container with authentication disabled
        logger.info("Creating a new Neo4j container with authentication disabled...")
        subprocess.run([
            "docker", "run", "--restart", "always", 
            "--name", "marvin-neo4j",  # Give it a specific name for easier reference
            "--publish=7474:7474", "--publish=7687:7687", 
            "--env", "NEO4J_AUTH=none", 
            "--volume=./neo4j/data:/data",
            "-d",  # Run in detached mode
            "neo4j:5.26.5-community"
        ], check=True)
        
        # Wait for Neo4j to be ready
        logger.info("Waiting for Neo4j to be ready...")
        time.sleep(10)  # Give it time to start up
        
        logger.info("Neo4j container started successfully")
        return True
        
    except subprocess.CalledProcessError as e:
        logger.error(f"Error checking/starting Neo4j container: {e}")
        logger.error(f"Command output: {e.stdout} {e.stderr}")
        return False
    except Exception as e:
        logger.error(f"Unexpected error checking Neo4j: {str(e)}")
        return False


if __name__ == "__main__":
    # Load core configuration to make environment variables available
    config = load_config()
    
    # Set critical environment variables if they're provided in the config
    # but not already in the environment
    if config.secret_key and not os.environ.get("SECRET_KEY"):
        os.environ["SECRET_KEY"] = config.secret_key
    
    if config.admin_token and not os.environ.get("ADMIN_TOKEN"):
        os.environ["ADMIN_TOKEN"] = config.admin_token
        
    # Print confirmation for debugging
    print(f"Admin token available: {'Yes' if os.environ.get('ADMIN_TOKEN') else 'No'}")
    print(f"Secret key available: {'Yes' if os.environ.get('SECRET_KEY') else 'No'}")
    
    # Check and ensure Neo4j is running
    neo4j_ready = check_neo4j_running()
    if not neo4j_ready:
        print("WARNING: Could not confirm Neo4j is running. The application may not function correctly.")
    
    # Run the server
    uvicorn.run(
        "api.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.RELOAD,
        log_level="debug" if settings.DEBUG else "info"
    )
