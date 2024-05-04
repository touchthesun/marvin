import re
from langchain.agents import create_tool_calling_agent
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain.chains import create_retrieval_chain
from langchain.chains.combine_documents import create_stuff_documents_chain
from services.neo4j_services import setup_existing_graph_vector_store
from tools import get_tool_descriptions, TOOL_REGISTRY, initialize_tools, RetrievalTool, convert_to_openai_tool
from utils.logger import get_logger
from config import load_config

# from langchain.chains import ChatVectorDBChain
from langchain_openai import ChatOpenAI


logger = get_logger(__name__)
config = load_config()



class AgentInitializer:
    def __init__(self, neo4j_uri, neo4j_username, neo4j_password):
        self.neo4j_uri = neo4j_uri
        self.neo4j_username = neo4j_username
        self.neo4j_password = neo4j_password


    def initialize_agent(self) -> create_tool_calling_agent:
        # Initialize the language model

        llm = ChatOpenAI(model_name=config["model_name"])

        # Initialize the knowledge graph vector store
        vector_store = setup_existing_graph_vector_store()

        # Create the retriever
        retriever = vector_store.as_retriever()

        # Create the combine documents chain
        system_prompt = (
            "Use the given context to answer the question. "
            "If you don't know the answer, say you don't know. "
            "Use three sentence maximum and keep the answer concise."
            "{context}"
        )
        prompt = ChatPromptTemplate.from_messages(
            [("system", system_prompt), ("human", "{input}")]
        )
        combine_docs_chain = create_stuff_documents_chain(llm, prompt)

        # Create the retrieval chain
        retrieval_chain = create_retrieval_chain(
            retriever,
            combine_docs_chain,
        )

        # Initialize tools
        tool_names = ["python_repl", "keyword_search", "vector_search"]
        tools = initialize_tools(tool_names, vector_store)

        # Add the retrieval_chain to the tools list
        tools.append(RetrievalTool(retrieval_chain))

        # Create the agent prompt
        agent_prompt_template = ChatPromptTemplate.from_messages([
            ("system", "You are a helpful assistant that can answer questions based on your training data and the knowledge graph. You can also use the available tools to perform web searches, retrieve relevant information, and execute code."),
            MessagesPlaceholder(variable_name="agent_scratchpad"),
            ("human", "{input}")
        ])

        # Create the agent with the tools and prompt
        agent = create_tool_calling_agent(
            llm=llm,
            tools=tools,
            prompt=agent_prompt_template,
            tool_conversion_function=convert_to_openai_tool
        )

        return agent




# # Function to create and initialize the agent
# def initialize_agent(model_name: str, prompt: Optional[ChatPromptTemplate] = None):
#     try:
#         logger.info("Initializing the ChatOpenAI language model.")
#         llm = ChatOpenAI(model_name=model_name, temperature=0)

#         # Initialize graph database and vector store
#         vector_store = setup_existing_graph_vector_store()

#         # Create tools directly
#         hybrid_retriever_tool = create_hybrid_retriever_tool(vector_store)
#         other_tools = [PythonREPLTool()]
#         tools = [hybrid_retriever_tool] + other_tools

#         if prompt is None:
#             logger.warning("No prompt provided. Using the default prompt.")
#             prompt = generate_marvin_init_prompt(vector_store=vector_store)

#         logger.info("Creating the agent.")
#         agent = create_tool_calling_agent(llm, tools, prompt=prompt)
#         agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

#         logger.info("Agent initialized successfully.")
#         return agent_executor
#     except Exception as e:
#         logger.error("Failed to initialize the agent.", exc_info=True)
#         return None



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

