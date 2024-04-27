import re
from typing import Optional
from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate

from tools import get_tool_descriptions, TOOL_REGISTRY
from utils.logger import get_logger
from config import load_config

logger = get_logger(__name__)
config = load_config()



# Function to create and initialize the agent
def initialize_agent(model_name: str, prompt: Optional[ChatPromptTemplate] = None) -> Optional[AgentExecutor]:
    try:
        logger.info("Initializing the ChatOpenAI language model.")
        llm = ChatOpenAI(model_name=model_name, temperature=0)
        
        # Dynamically instantiate tools from TOOL_REGISTRY
        tools = [tool() for tool in TOOL_REGISTRY.values() if callable(tool)]

        if not tools:
            logger.error("No tools available in the registry.")
            return None

        if prompt is None:
            logger.warning("No prompt provided. Using the default prompt.")
            prompt = generate_marvin_init_prompt()

        logger.info("Creating the agent.")
        agent = create_tool_calling_agent(llm, tools, prompt=prompt)
        agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

        logger.info("Agent initialized successfully.")
        return agent_executor
    except Exception as e:
        logger.error("Failed to initialize the agent.", exc_info=True)
        return None


def generate_marvin_init_prompt():
    # Retrieve and format tool descriptions
    tool_descriptions_dict = get_tool_descriptions(list(TOOL_REGISTRY.keys()))
    formatted_tool_descriptions = "\n".join(f"{name}: {desc}" for name, desc in tool_descriptions_dict.items())

    # Define messages including placeholders for chat history and agent scratchpad
    messages = [
        ("system", "You are a helpful assistant. Here are your tools and capabilities:\n" + formatted_tool_descriptions),
        ("placeholder", "{chat_history}"),
        ("human", "{input}"),
        ("placeholder", "{agent_scratchpad}")
    ]

    # Generate and return the ChatPromptTemplate using from_messages
    return ChatPromptTemplate.from_messages(messages)
