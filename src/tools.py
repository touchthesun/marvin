import streamlit as st
import regex as re
from typing import Dict, List, Any
from pydantic import Field, BaseModel
from langchain.tools import BaseTool
from langchain.callbacks.base import BaseCallbackHandler
from langchain_experimental.utilities import PythonREPL

from langchain_community.vectorstores.neo4j_vector import Neo4jVector
from langchain_core.vectorstores import VectorStoreRetriever
from langchain_core.utils.function_calling import convert_to_openai_function
from langchain.schema import Document



from utils.logger import get_logger
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

class CustomBaseTool:
    def __init__(self, 
                name, 
                args_schema=None, 
                callback_manager=None, 
                callbacks=None, 
                description=None, 
                handle_tool_error=False, 
                handle_validation_error=False, 
                metadata=None, 
                return_direct=False, 
                tags=None, 
                verbose=False, 
                details=None):
        self.details = details
        self.base_tool = BaseTool(
            name=name,
            args_schema=args_schema,
            callback_manager=callback_manager,
            callbacks=callbacks,
            description=description or self.generate_description(),
            handle_tool_error=handle_tool_error,
            handle_validation_error=handle_validation_error,
            metadata=metadata,
            return_direct=return_direct,
            tags=tags,
            verbose=verbose
        )
        super().__init__(name=name, details=details, **kwargs)
        self.base_tool.description = self.generate_description()

    def generate_description(self):
        if self.details:
            return (
                f"{self.base_tool.name} is designed to {self.details.purpose}. "
                f"It is especially useful for {self.details.context}. "
                f"Using {self.details.method}, it {self.details.action_desc}, "
                f"resulting in {self.details.output}. "
                f"This tool operates in a {self.details.interaction_type} manner."
            )
        return self.base_tool.description

    def _run(self, *args, **kwargs):
        return self.base_tool._run(*args, **kwargs)


# Custom Tools

class RetrievalTool(CustomBaseTool):
    name = "retrieval_tool"
    details = ToolDetails(
        purpose="retrieve relevant information from the knowledge graph",
        context="answering questions that require specific information from the knowledge graph",
        method="vector similarity search",
        action_desc="retrieves the most relevant documents or nodes from the knowledge graph",
        output="a list of relevant documents or nodes",
        interaction_type="query-based"
    )
    # retrieval_chain: Any = Field(default=None, description="The retrieval chain object")

    def __init__(self, retrieval_chain, **kwargs):
        if retrieval_chain is None:
            raise ValueError("retrieval_chain cannot be None")
        self.retrieval_chain = retrieval_chain
        super().__init__(name=self.name, details=self.details, **kwargs)

    def _run(self, query: str) -> str:
        result = self.retrieval_chain.run(query)
        return result

    def _arun(self, query: str) -> str:
        raise NotImplementedError("This tool does not support async")


class HybridRetriever(VectorStoreRetriever):
    def __init__(self, vectorstore: Neo4jVector, **kwargs):
        super().__init__(vectorstore=vectorstore, **kwargs)

    def get_relevant_documents(self, query: str) -> List[Document]:
        vector_retriever = self.vectorstore.as_retriever(search_type="hybrid")
        return vector_retriever.get_relevant_documents(query)

# class SearchTool(CustomBaseTool):
#     name: str = "google_search"
#     details: ToolDetails = ToolDetails(
#         purpose="perform web searches",
#         context="when you need to find information on the internet",
#         method="using the SerpAPI service to query Google",
#         action_desc="searches the web and returns relevant results",
#         output="a list of search results with titles, URLs, and descriptions",
#         interaction_type="query-based"
#     )

#     def __init__(self, serpapi_api_key: str, **kwargs):
#         super().__init__(**kwargs)
#         self.search_wrapper = SerpAPIWrapper(serpapi_api_key=serpapi_api_key)

#     def _run(self, query: str):
#         try:
#             search_results = self.search_wrapper.run(query)
#             return search_results
#         except Exception as e:
#             logger.error(f"Error performing web search: {str(e)}", exc_info=True)
#             return {"error": str(e)}

#     def call(self, query: str):
#         return self._run(query)



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
        try:
            python_repl = PythonREPL()
            result = python_repl.run(code)
            return result
        except Exception as e:
            logger.error(f"Error executing Python code: {str(e)}", exc_info=True)
            return {"error": str(e)}

    def call(self, code: str):
        return self._run(code)


class VectorSearchTool(CustomBaseTool):
    name: str = "vector_search"
    retriever: HybridRetriever = Field(default=None, description="Retriever instance for vector search")
    vector_store: Any = Field(default=None, description="Stores the vector data for document retrieval")
    details: ToolDetails = ToolDetails(
        purpose="retrieve relevant documents from the knowledge graph using vector similarity",
        context="when you need to find information related to a specific query based on semantic similarity",
        method="vector similarity search leveraging metadata and node relationships",
        action_desc="retrieves relevant documents based on the input query and their vector representations",
        output="a list of relevant documents",
        interaction_type="query-based"
    )

    class Config:
        arbitrary_types_allowed = True

    def __init__(self, vector_store, **kwargs):
        super().__init__(**kwargs)
        self.retriever = HybridRetriever(vector_store)

    def _run(self, query: str) -> str:
        docs = self.retriever.get_relevant_documents(query)
        doc_chunks = [doc.page_content for doc in docs]
        return "\n".join(doc_chunks)


class KeywordSearchTool(CustomBaseTool):
    name: str = "keyword_search"
    retriever: HybridRetriever = Field(default=None, description="Retriever instance for vector search")
    vector_store: Any = Field(default=None, description="Stores the vector data for document retrieval")
    details: ToolDetails = ToolDetails(
        purpose="retrieve relevant documents from the knowledge graph using keyword search",
        context="when you need to find information related to specific keywords or phrases",
        method="keyword search leveraging metadata and node relationships",
        action_desc="retrieves relevant documents based on the input query keywords",
        output="a list of relevant documents",
        interaction_type="query-based"
    )

    class Config:
        arbitrary_types_allowed = True

    def __init__(self, vector_store, **kwargs):
        super().__init__(**kwargs)
        self.retriever = HybridRetriever(vector_store)

    def _run(self, query: str) -> list:
        return self.retriever.get_relevant_documents(query)

# Pretty much what it says on the tin


TOOL_REGISTRY = {
    "python_repl": PythonREPLTool,
    "keyword_search": lambda vector_store=None: KeywordSearchTool(vector_store=vector_store),
    "vector_search": lambda vector_store=None: VectorSearchTool(vector_store=vector_store),
    "retrieval_tool": lambda retrieval_chain=None: RetrievalTool(retrieval_chain=retrieval_chain),
}


def convert_to_openai_tool(tool: Any) -> Dict:
    if hasattr(tool, "name"):
        function = convert_to_openai_function(tool)
        function["name"] = tool.name
        return function
    else:
        return convert_to_openai_function(tool)

# Helper function to create a dictionary of tool descriptions
def get_tool_descriptions(tool_names: List[str], vector_store=None) -> Dict[str, str]:
    descriptions = {}
    for name in tool_names:
        tool_factory = TOOL_REGISTRY.get(name)
        if tool_factory:
            try:
                # Check if the tool requires specific parameters and handle accordingly
                tool_instance = tool_factory(vector_store) if name == "hybrid_retriever" else tool_factory()
                descriptions[name] = tool_instance.description
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




def initialize_tools(tool_names: List[str], vector_store) -> List[BaseTool]:
    """
    Initialize and return a list of tools based on the provided tool names and vector store.

    Args:
        tool_names (List[str]): A list of tool names to initialize.
        vector_store: The vector store instance to be passed to tools that require it.

    Returns:
        List[BaseTool]: A list of initialized tools.

    Raises:
        ValueError: If a tool name is not found in the registry.
    """
    tools = []
    for tool_name in tool_names:
        if tool_name not in TOOL_REGISTRY:
            logger.error(f"Tool '{tool_name}' not found in the registry.")
            raise ValueError(f"Tool '{tool_name}' not found in the registry.")

        try:
            tool_init_fn = TOOL_REGISTRY[tool_name]
            if callable(tool_init_fn):
                if tool_name == "keyword_search" or tool_name == "vector_search":
                    tool = tool_init_fn(vector_store)
                else:
                    tool = tool_init_fn()
            else:
                tool = tool_init_fn
            tools.append(tool)
            logger.info(f"Initialized tool: {tool_name}")
        except Exception as e:
            logger.error(f"Error initializing tool '{tool_name}': {e}")

    return tools


# Workflow Helper Functions

# def extract_urls_from_prompt(prompt):
#     logger.debug("Extracting URLs from prompt.")
#     # Regular expression pattern to match URLs
#     url_pattern = r'https?://[^\s]+'
#     urls = re.findall(url_pattern, prompt)
#     if not urls:
#         logger.warning("No URLs found in the prompt.")
#         return None
#     return urls[0]

# class QueryGraphTool(CustomBaseTool):
#     name: str = "QueryGraphTool"
#     details: ToolDetails = ToolDetails(
#         purpose="interpret and process natural language queries against graph databases",
#         context="extracting specific data points or relationships without direct database querying knowledge",
#         method="a natural language processing interface",
#         action_desc="translates user queries into database commands",
#         output="structured data",
#         interaction_type="synchronous"
#     )

#     def _run(self, query: str):
#         logger.info("Initiating query_graph_workflow.")
#         try:
#             neo4j_graph = Neo4jConnection.get_graph()
#             model_name = config["model_name"]
#             response = query_graph(query, model_name, neo4j_graph)
#             logger.info("Graph query completed successfully.")
#             return response
#         except Exception as e:
#             logger.error("Failed to complete graph query.", exc_info=True)
#             return {"error": str(e)}

#     def call(self, query: str):
#         return self._run(query)


# Workflows
# TODO Turn these into CustomBaseTools

# def add_page_workflow(prompt):
#     logger.info("Initiating add_page_workflow.")
#     url = extract_urls_from_prompt(prompt)
#     if not url:
#         logger.error("No URL found in the prompt.")
#         return "No valid URL provided."
    
#     logger.debug(f"URL extracted: {url}")
#     metadata = create_url_metadata_json(url)
#     if "error" in metadata:
#         logger.error(f"Metadata extraction failed: {metadata['error']}")
#         return metadata["error"]

#     response = add_page_to_graph(metadata)
#     if response is None:
#         logger.error("Received no response from add_page_to_graph.")
#         return "Failed to add page metadata to graph due to an unknown error."
#     if "error" in response:
#         logger.error(f"Failed to add page metadata to graph: {response['error']}")
#         return response["error"]
    
#     logger.info("Page metadata added to graph successfully.")
#     return response


# def end_conversation_workflow(prompt: str):
#     logger.info("Initiating end of conversation workflow.")
#     end_prompt = {
#         "role": "system",
#         "content": (
#             "We're wrapping up our work for the day. You've been a great engineering partner. "
#             "Thanks for all your help. Let's close off with your last thoughts: " + prompt
#         )
#     }

#     if 'chat_history' in st.session_state:
#         st.session_state['chat_history'].append(end_prompt)

#     # Ensure all messages are formatted correctly
#     prepared_messages = [format_message_for_api(msg) for msg in st.session_state['chat_history']]

#     try:
#         completion = chat_completion(prepared_messages, model=config["model_name"])
#         if isinstance(completion, dict) and "error" in completion:
#             response = completion['error']
#         else:
#             response = completion.choices[0].message.content
#             st.session_state['session_active'] = False
#     except Exception as e:
#         logger.error("Exception during end conversation completion: ", exc_info=True)
#         response = "An error occurred: " + str(e)

#     return response




