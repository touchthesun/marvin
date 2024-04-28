import re
from typing import Optional
from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from services.neo4j_services import initialize_graph_database
from tools import get_tool_descriptions, create_hybrid_retriever_tool, PythonREPLTool, TOOL_REGISTRY
from utils.logger import get_logger
from config import load_config

logger = get_logger(__name__)
config = load_config()



# Function to create and initialize the agent
def initialize_agent(model_name: str, prompt: Optional[ChatPromptTemplate] = None):
    try:
        logger.info("Initializing the ChatOpenAI language model.")
        llm = ChatOpenAI(model_name=model_name, temperature=0)

        # Initialize graph database and vector store
        vector_store = initialize_graph_database()

        # Create tools directly
        hybrid_retriever_tool = create_hybrid_retriever_tool(vector_store)
        other_tools = [PythonREPLTool()]
        tools = [hybrid_retriever_tool] + other_tools

        if prompt is None:
            logger.warning("No prompt provided. Using the default prompt.")
            prompt = generate_marvin_init_prompt(vector_store=vector_store)

        logger.info("Creating the agent.")
        agent = create_tool_calling_agent(llm, tools, prompt=prompt)
        agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

        logger.info("Agent initialized successfully.")
        return agent_executor
    except Exception as e:
        logger.error("Failed to initialize the agent.", exc_info=True)
        return None



def generate_marvin_init_prompt(vector_store=None):
    # Assume that vector_store or any other dependencies are passed here if needed
    tool_descriptions_dict = get_tool_descriptions(list(TOOL_REGISTRY.keys()), vector_store=vector_store)
    formatted_tool_descriptions = "\n".join(f"{name}: {desc}" for name, desc in tool_descriptions_dict.items())

    messages = [
        ("system", "You are a helpful assistant. Here are your tools and capabilities:\n" + formatted_tool_descriptions),
        ("placeholder", "{chat_history}"),
        ("human", "{input}"),
        ("placeholder", "{agent_scratchpad}")
    ]

    return ChatPromptTemplate.from_messages(messages)

