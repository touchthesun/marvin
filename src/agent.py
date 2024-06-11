from typing import Optional
from langchain.agents import create_tool_calling_agent
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from tools import KnowledgeGraphSearchTool
from utils.logger import get_logger
from config import load_config
from db import Neo4jConnection

# from langchain.chains import ChatVectorDBChain
from langchain_openai import ChatOpenAI


logger = get_logger(__name__)
config = load_config()

class AgentInitializer:
    def __init__(self, config: dict, model_name: Optional[str] = None):
        self.config = config
        self.model_name = model_name or "gpt-4"

    def initialize_agent(self):
        # Initialize the language model
        llm = Neo4jConnection.get_llm(model_name=self.model_name, max_tokens=1024)
        neo4j_vector = Neo4jConnection.get_vector_store()

        # Initialize the knowledge graph tool
        knowledge_graph_tool = KnowledgeGraphSearchTool()

        prompt = ChatPromptTemplate.from_messages([
            ("system", "You are a helpful assistant that can answer questions based on your training data and the knowledge graph."),
            MessagesPlaceholder(variable_name="agent_scratchpad"),
            ("human", "{input}")
        ])
        # Create the agent with the knowledge graph tool
        agent = create_tool_calling_agent(
            llm=llm,
            tools=[knowledge_graph_tool],
            prompt=prompt
        )

        return agent
