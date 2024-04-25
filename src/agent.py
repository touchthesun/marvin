import re
import json
import streamlit as st
from langchain import hub
from langchain.agents import AgentExecutor, create_openai_tools_agent
from langchain.agents.output_parsers import OpenAIFunctionsAgentOutputParser
from langchain_community.chat_models import ChatOpenAI
from langchain_community.tools.convert_to_openai import format_tool_to_openai_function
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from tools import initialize_tools

from services.neo4j_services import query_graph, add_page_metadata_to_graph
from services.metadata import create_url_metadata_json
from services.openai_services import chat_completion

from db import Neo4jConnection
from utils.logger import get_logger
from config import load_config

logger = get_logger(__name__)
config = load_config()



# Function to create and initialize the agent
def initialize_agent():
    try:
        logger.info("Initializing the ChatOpenAI language model.")
        llm = ChatOpenAI()  # Initialize the language model
        tools = initialize_tools(tool_names=['tavily_search'])
        
        logger.info("Fetching pre-configured prompt.")
        prompt = hub.pull("hwchase17/openai-tools-agent")
        
        logger.info("Creating the agent.")
        agent = create_openai_tools_agent(llm, tools, prompt)
        agent_executor = AgentExecutor(agent=agent, tools=tools)
        
        logger.info("Agent initialized successfully.")
        return agent_executor
    except Exception as e:
        logger.error("Failed to initialize the agent.", exc_info=True)
        raise e  # Rethrow the exception after logging

# Utility function to create a chat prompt template
def create_prompt_template():
    try:
        assistant_system_message = "You are a helpful assistant. Use tools to best answer the user's questions."
        prompt = ChatPromptTemplate.from_messages([
            ("system", assistant_system_message),
            MessagesPlaceholder(variable_name="chat_history"),
            ("user", "{input}"),
            MessagesPlaceholder(variable_name="agent_scratchpad"),
        ])
        logger.info("Prompt template created successfully.")
        return prompt
    except Exception as e:
        logger.error("Failed to create prompt template.", exc_info=True)
        raise e



def get_simple_keyword_router():
    """
    Decision making based on contents of prompt (Simple LLM Router).
    Using raw strings with word boundaries to ensure exact matches of keywords.
    """
    return {
        r"\b(add\s+page|add\s+content)\b": add_page_workflow,
        r"\b(query|find|search)\b": query_graph_workflow,
        r"\b(hello|hey|hi)\b": chat_workflow,
        r"\b(exit|end|bye)\b": end_conversation_workflow,
    }


def get_first_keyword_in_prompt(prompt: str):
    try:
        logger.info(f"Searching for keywords in the prompt: {prompt}")
        map_keywords_to_agents = get_simple_keyword_router()
        prompt_lower = prompt.lower()
        for regex, agent in map_keywords_to_agents.items():
            if re.search(regex, prompt_lower, re.IGNORECASE):
                logger.info(f"Keyword found: {regex}, triggering corresponding workflow.")
                return agent, re.search(regex, prompt_lower, re.IGNORECASE).group(0)
        logger.warning("No keywords found in the prompt.")
        return None, None
    except Exception as e:
        logger.error("Error searching for keywords in the prompt.", exc_info=True)
        return None, None


# Agent Workflows

def query_graph_workflow(prompt):
    logger.info("Initiating query_graph_workflow.")
    try:
        neo4j_graph = Neo4jConnection.get_graph()
        model_name = config["model_name"]
        response = query_graph(prompt, model_name, neo4j_graph)
        logger.info("Graph query completed successfully.")
        return response
    except Exception as e:
        logger.error("Failed to complete graph query.", exc_info=True)
        return {"error": str(e)}


def add_page_workflow(prompt):
    logger.info("Initiating add_page_workflow.")
    url = extract_urls_from_prompt(prompt)
    if not url:
        logger.error("No URL found in the prompt.")
        return "No valid URL provided."
    
    logger.debug(f"URL extracted: {url}")
    metadata = create_url_metadata_json(url)
    if "error" in metadata:
        logger.error(f"Metadata extraction failed: {metadata['error']}")
        return metadata["error"]

    response = add_page_metadata_to_graph(metadata)
    if response is None:
        logger.error("Received no response from add_page_metadata_to_graph.")
        return "Failed to add page metadata to graph due to an unknown error."
    if "error" in response:
        logger.error(f"Failed to add page metadata to graph: {response['error']}")
        return response["error"]
    
    logger.info("Page metadata added to graph successfully.")
    return response




# TODO refactor to do link cleaning and make connector for security scanner on urls
def extract_urls_from_prompt(prompt):
    logger.debug("Extracting URLs from prompt.")
    # Regular expression pattern to match URLs
    url_pattern = r'https?://[^\s]+'
    urls = re.findall(url_pattern, prompt)
    if not urls:
        logger.warning("No URLs found in the prompt.")
        return None
    return urls[0]


def serialize_message_for_api(message):
    """Converts messages to a dictionary format for API consumption."""
    if isinstance(message, AIMessage):
        return json.loads(message.json())  # Convert JSON string to dictionary
    elif isinstance(message, dict):
        return message  # Return as is if already a dictionary
    else:
        return {"role": "unknown", "content": str(message)}  # Fallback for other types



def format_message_for_api(message):
    """Format message to match the expected API structure, assigning roles appropriately."""
    if isinstance(message, dict):  # Handle dictionary messages directly
        return {
            "role": message.get('role', 'user'),
            "content": message.get('content', '')
        }
    else:  # For AIMessage or similar objects, determine the role by context or fixed assignment
        return {
            "role": "assistant",  # Assuming all AIMessage instances are from the assistant
            "content": message.content if hasattr(message, 'content') else str(message)
        }


def chat_workflow(prompt):
    logger.info("Starting chat workflow.")
    if 'chat_history' not in st.session_state:
        st.session_state['chat_history'] = []
        logger.debug("Initialized chat history in session.")

    # Create and append the user message
    st.session_state['chat_history'].append({"role": "user", "content": prompt})
    logger.debug(f"Appended user input to chat history: {prompt}")

    # Format messages for API consumption
    messages = [format_message_for_api(msg) for msg in st.session_state['chat_history']]
    logger.debug(f"Prepared messages for chat completion: {messages}")

    try:
        completion = chat_completion(messages, model=config["model_name"])
        logger.debug("Chat completion executed successfully.")

        if isinstance(completion, dict) and "error" in completion:
            logger.error(f"Error in chat completion: {completion['error']}")
            response = completion['error']
        else:
            response = completion.choices[0].message.content
            st.session_state['chat_history'].append({"role": "assistant", "content": response})
            logger.debug(f"Appended LLM response to chat history: {response}")

    except Exception as e:
        logger.error("Exception during chat completion", exc_info=True)
        response = f"An error occurred: {str(e)}"

    return response



def end_conversation_workflow(prompt: str):
    logger.info("Initiating end of conversation workflow.")
    end_prompt = {
        "role": "system",
        "content": (
            "We're wrapping up our work for the day. You've been a great engineering partner. "
            "Thanks for all your help. Let's close off with your last thoughts: " + prompt
        )
    }

    if 'chat_history' in st.session_state:
        st.session_state['chat_history'].append(end_prompt)

    # Ensure all messages are formatted correctly
    prepared_messages = [format_message_for_api(msg) for msg in st.session_state['chat_history']]

    try:
        completion = chat_completion(prepared_messages, model=config["model_name"])
        if isinstance(completion, dict) and "error" in completion:
            response = completion['error']
        else:
            response = completion.choices[0].message.content
            st.session_state['session_active'] = False
    except Exception as e:
        logger.error("Exception during end conversation completion: ", exc_info=True)
        response = "An error occurred: " + str(e)

    return response
