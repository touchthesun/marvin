## Marvin: Your LLM-Powered Personal Librarian

Marvin emerged from a simple yet deeply personal need: to combat the "out of sight, out of mind" nature of digital bookmarking. This project is about offering a tool to make the digital environment a more manageable place.

I spend a lot of time researching things on the internet. Every article, blog post, and video saved as a bookmark represents a moment of discovery and learning. But now my bookmarks folder is full of things I don't remember saving, without context or connection, and I don't know how to reconstruct what I was thinking when I saved something. This means that even though I have hundreds of saved bookmarks, and my 87 emotional support chrome tabs, I have only the most tenuous access to any of that information.

Marvin is a librarian for your browsing data. Powered by a language learning model (LLM), it transforms your bookmarks and open tabs from hidden, cluttered lists into an engaging, accessible library. With Marvin, your digital finds are not just remembered but also become integral parts of your continuous learning journey.

## Project Status
Currently, Marvin is in its early development stages. We're actively testing and improving its features. Stay tuned for updates on installation and setup procedures.

## Getting Started

### Prerequisites

Marvin is developed with Python 3.9, leveraging Conda for environment management. Before you begin, ensure you have Conda installed on your system.

### Installation

Clone the repository to your local machine.

Create a Conda environment named marvin:

'conda create -n marvin python=3.9'

Activate the marvin environment:

'conda activate marvin'

Install required dependencies:

'pip install -r requirements.txt'

### Configuration
Copy the .env.template file and rename it to .env.
Fill in the required values in the .env file:


OPENAI_API_KEY: Your OpenAI API key
NEO4J_URI: The URI for your Neo4j instance
NEO4J_USERNAME: Your Neo4j username
NEO4J_PASSWORD: Your Neo4j password
AURA_INSTANCEID: Your Aura instance ID (if applicable)
AURA_INSTANCENAME: Your Aura instance name (if applicable)

## Running Marvin
To test and interact with Marvin during its development, we use a Streamlit interface. Activate this interface by running:

'streamlit run src/app.py'

## License
Marvin is made available under the CC0 1.0 Universal (CC0 1.0) Public Domain Dedication.