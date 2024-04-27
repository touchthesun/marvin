import streamlit as st
import regex as re
from typing import Dict, List, Any
from pydantic import Field, BaseModel, validator
from langchain.tools import BaseTool
from langchain.callbacks.base import BaseCallbackHandler
from langchain_experimental.utilities import PythonREPL

from services.neo4j_services import query_graph, add_page_metadata_to_graph
from services.metadata import create_url_metadata_json
from services.openai_services import chat_completion
from utils.logger import get_logger
from db import Neo4jConnection
from config import load_config

# Initialize logging and load config
config = load_config()
logger = get_logger(__name__)

"""
Sets the semantic components of a Tool Description as properties of CustomBaseTool
Provides a description(self) property which is inherited by all Custom Tools.
"""

class ToolDetails(BaseModel):
    purpose: str
    context: str
    method: str
    action_desc: str
    output: str
    interaction_type: str

class CustomBaseTool(BaseTool):
    details: ToolDetails = Field(...)
    description: str = Field(default="")

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.description = self.generate_description()  # Set the description using a method

    def generate_description(self):
        if self.details:
            return (
                f"{self.name} is designed to {self.details.purpose}. "
                f"It is especially useful for {self.details.context}. "
                f"Using {self.details.method}, it {self.details.action_desc}, "
                f"resulting in {self.details.output}. "
                f"This tool operates in a {self.details.interaction_type} manner."
            )
        return "Default description"


# Custom Tools
class QueryGraphTool(CustomBaseTool):
    name: str = "QueryGraphTool"
    details: ToolDetails = ToolDetails(
        purpose="interpret and process natural language queries against graph databases",
        context="extracting specific data points or relationships without direct database querying knowledge",
        method="a natural language processing interface",
        action_desc="translates user queries into database commands",
        output="structured data",
        interaction_type="synchronous"
    )

    def _run(self, query: str):
        logger.info("Initiating query_graph_workflow.")
        try:
            neo4j_graph = Neo4jConnection.get_graph()
            model_name = config["model_name"]
            response = query_graph(query, model_name, neo4j_graph)
            logger.info("Graph query completed successfully.")
            return response
        except Exception as e:
            logger.error("Failed to complete graph query.", exc_info=True)
            return {"error": str(e)}

    def call(self, query: str):
        # This method can now serve as a simple public interface to `_run` if additional processing is needed
        return self._run(query)

class PythonREPLTool(CustomBaseTool):
    name: str = "PythonREPL"
    details: ToolDetails = ToolDetails(
        purpose="execute Python code snippets",
        context="within an interactive REPL environment",
        method="direct execution of Python statements",
        action_desc="evaluates Python code and returns results",
        output="output from the executed Python commands",
        interaction_type="synchronous"
    )
    
    def _run(self, code: str):
        # Assuming there's a function python_repl.run() that executes Python code and returns the output
        try:
            python_repl = PythonREPL()
            result = python_repl.run(code)  # You will need to define or import this functionality
            return result
        except Exception as e:
            logger.error(f"Error executing Python code: {str(e)}", exc_info=True)
            return {"error": str(e)}

    def call(self, code: str):
        return self._run(code)

# Pretty much what it says on the tin

TOOL_REGISTRY = {
    "query_graph": QueryGraphTool,
    "python_repl": PythonREPLTool,
}


# Workflows

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


# Workflow Helper Functions

def extract_urls_from_prompt(prompt):
    logger.debug("Extracting URLs from prompt.")
    # Regular expression pattern to match URLs
    url_pattern = r'https?://[^\s]+'
    urls = re.findall(url_pattern, prompt)
    if not urls:
        logger.warning("No URLs found in the prompt.")
        return None
    return urls[0]


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



# Utility Functions

def load_tools(tool_names: List[str]) -> List[BaseTool]:
    tools = []
    for tool_name in tool_names:
        if tool_name not in TOOL_REGISTRY:
            raise ValueError(f"Tool '{tool_name}' not found in the registry.")

        tool_init_fn = TOOL_REGISTRY[tool_name]
        if callable(tool_init_fn):
            tool = tool_init_fn()
        else:
            tool = tool_init_fn
        tools.append(tool)
    return tools


# Helper function to create a dictionary of tool descriptions
def get_tool_descriptions(tool_names: List[str]) -> Dict[str, str]:
    descriptions = {}
    for name in tool_names:
        tool_class = TOOL_REGISTRY.get(name)
        if tool_class:
            try:
                # Instantiate the tool class, which should have sensible defaults or be handled to allow no-arg instantiation
                tool_instance = tool_class()
                descriptions[name] = tool_instance.description  # Directly use the dynamic description property
                logger.info(f"Successfully retrieved description for tool: {name}")
            except Exception as e:
                logger.error(f"Error instantiating tool {name}: {str(e)}", exc_info=True)
                descriptions[name] = f"Error instantiating tool: {str(e)}"
        else:
            error_message = f"Tool not found in registry: {name}"
            logger.error(error_message)
            descriptions[name] = "Tool not found in registry."
    return descriptions



# TODO This logger has not been implemented yet
class ToolRunLogger(BaseCallbackHandler):
    def on_tool_start(self, serialized: Dict[str, Any], input_str: str, **kwargs):
        print(f"Starting tool run: {serialized['name']}")

    def on_tool_end(self, output: Dict[str, Any], **kwargs):
        print(f"Tool run completed: {output}")

