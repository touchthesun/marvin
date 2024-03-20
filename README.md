## Marvin: Your LLM-Powered Personal Librarian

Marvin emerged from a simple yet deeply personal need: to combat the "out of sight, out of mind" nature of digital bookmarking that many, including myself, struggle with due to ADHD. This project isn't about selling an idea; it's about offering a tool to make the digital environment a more manageable place for those of us with neurodivergence.

As someone who lives with ADHD, I've experienced firsthand the endless curiosity and the relentless pursuit of knowledge on the internet. Every article, blog post, and video saved as a bookmark represents a moment of discovery and learning. Yet, the transient nature of our digital interactions, compounded by ADHD's impact on object permanence, means these digital breadcrumbs often lead to forgotten corners rather than new insights.

Marvin is more than just a browser extension; it's a companion for your digital exploration. Powered by a language learning model (LLM), it transforms your bookmarks and open tabs from hidden, cluttered lists into an engaging, accessible library. With Marvin, your digital finds are not just remembered but also become integral parts of your continuous learning journey.

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
OPENAI_API_KEY: Your OpenAI API key.
NEO4J_URI: The URI for your Neo4j instance.
NEO4J_USERNAME: Your Neo4j username.
NEO4J_PASSWORD: Your Neo4j password.
AURA_INSTANCEID: Your Aura instance ID (if applicable).
AURA_INSTANCENAME: Your Aura instance name (if applicable).

## Running Marvin
To test and interact with Marvin during its development, we use a Streamlit interface. Activate this interface by running:

'streamlit run src/app.py'

## License
Marvin is made available under the CC0 1.0 Universal (CC0 1.0) Public Domain Dedication.