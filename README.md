## Marvin: Your LLM-Powered Personal Librarian

Marvin emerged from a simple yet deeply personal need: to combat the "out of sight, out of mind" nature of digital bookmarking. This project is about offering a tool to make the digital environment a more manageable place.

I spend a lot of time researching things on the internet. Every article, blog post, and video saved as a bookmark represents a moment of discovery and learning. But now my bookmarks folder is full of things I don't remember saving, without context or connection, and I don't know how to reconstruct what I was thinking when I saved something. This means that even though I have hundreds of saved bookmarks, and my 87 emotional support chrome tabs, I have only the most tenuous access to any of that information.

Marvin is a librarian for your browsing data. Powered by a Large Language Model (LLM), it transforms your bookmarks and open tabs from hidden, cluttered lists into an engaging, accessible library. With Marvin, your digital finds are not just remembered but also become integral parts of your continuous learning journey.

## Project Status
Currently, Marvin is in its early development stages. We're actively testing and improving its features. Stay tuned for updates.

## Getting Started
 - Docker and Docker Compose installed on your system.
 - An OpenAI API key.


### Prerequisites

Marvin is developed with Python 3.9, leveraging Conda for environment management. Before you begin, ensure you have Conda installed on your system.

### Installation

Clone the repository to your local machine.

### Configuration
Marvin's behavior can be tailored through environment variables. These variables control aspects such as database connectivity, logging level, and feature toggling. Here's how to set them up:

Step 1: .env File
Copy the .env.template file to a new file named .env in the root directory of your project. This file will store your environment variables.

Step 2: Environment Variables
Here are the environment variables you can configure:

LOGGING_LEVEL: Sets the logging level (e.g., DEBUG, INFO, WARNING, ERROR, CRITICAL). Default is not set.
ENABLE_METADATA_COMPARISON: Enable or disable metadata comparison feature (True/False). Default is False.
OPENAI_API_KEY: Your OpenAI API key for accessing GPT models.
DB_MODE: Database mode, either LOCAL for local Neo4j instance or REMOTE for a cloud-based instance. Default is LOCAL.
STREAMLIT_MODE: Defines how Streamlit is run, either TERMINAL for local terminal execution or CONTAINER for running inside a Docker container. Default is TERMINAL.
NEO4J_URI_LOCAL: URI for your local Neo4j instance.
NEO4J_USERNAME_LOCAL: Username for your local Neo4j instance.
NEO4J_PASSWORD_LOCAL: Password for your local Neo4j instance.
NEO4J_URI_REMOTE: URI for your remote (cloud-based) Neo4j instance.
NEO4J_USERNAME_REMOTE: Username for your remote Neo4j instance.
NEO4J_PASSWORD_REMOTE: Password for your remote Neo4j instance.

Fill in the necessary values based on your setup and preferences.

Step 3: Using the Configuration
The application automatically reads these settings at startup. You can switch between local and remote databases or change the Streamlit mode by adjusting the respective environment variables in the .env file and restarting the application.

### Run Mode

If you want to run the app directly from your terminal, just cd to the root of the repo and run
'streamlit run src/app.py'

If you want to run the app in its containerized, local mode, make sure to set DB_MODE to LOCAL and then run

$ docker-compose up --build

This command builds and starts the containers for both the Streamlit app and the Neo4j database.

Access Marvin's Streamlit interface at http://localhost:8501 and the Neo4j Browser at http://localhost:7474.

### Configuration
The .env file configuration is crucial for connecting Marvin to the required services. Ensure you have set your OpenAI API key correctly. The Neo4j database will be automatically configured and initialized by Docker Compose, so no additional setup is required for Neo4j beyond setting your desired password in the .env file.

## Running Marvin
Once you have started the services using Docker Compose, you can interact with Marvin through the Streamlit interface accessible at http://localhost:8501.

## License
Marvin is made available under the CC0 1.0 Universal (CC0 1.0) Public Domain Dedication.