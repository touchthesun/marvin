from typing import Optional
from langchain.tools import BaseTool
from langchain_community.graphs import Neo4jGraph
from langchain_community.vectorstores import Neo4jVector
from db import Neo4jConnection
from services.neo4j_services import setup_existing_graph_vector_store



active_tools = []

def add_tool(tool: BaseTool):
    """Add a tool to the active tools list."""
    active_tools.append(tool)

def remove_tool(tool: BaseTool):
    """Remove a tool from the active tools list."""
    try:
        active_tools.remove(tool)
    except ValueError:
        print(f"Tool {tool} not found in the active tools list.")

def get_active_tools():
    """Get the list of active tools."""
    return active_tools


class KnowledgeGraphSearchTool(BaseTool):
    name = "knowledge_graph_search"
    description = "Searches a knowledge graph for relevant information to answer a query."
    graph: Neo4jGraph = None 
    vector: Neo4jVector = None

    def __init__(self):
        super().__init__()
        self.graph = Neo4jConnection.get_graph()
        self.vector = setup_existing_graph_vector_store()


    def _run(self, query: str) -> str:
        """Use the tool to retrieve information from the knowledge graph."""
        # Perform a text search on node properties
        text_search_results = self.graph.query(f"MATCH (n) WHERE ANY(prop IN keys(n) WHERE n[prop] CONTAINS '{query}') RETURN n")

        # Perform a semantic search based on node embeddings
        semantic_search_results = self.vector.similarity_search_with_score(query, k=10)

        # Combine and process the results
        combined_results = text_search_results + [result[0] for result in semantic_search_results]
        if combined_results:
            return "\n".join([self._process_result(result) for result in combined_results])
        else:
            return "No relevant information found in the knowledge graph."

    def _process_result(self, result):
        """Process a single result from the knowledge graph."""
        try:
            # Check if the result is from the text search
            if isinstance(result, dict):
                # Extract relevant information from the text search result
                node_data = result.get("n", {})
                node_properties = ", ".join(f"{k}: {v}" for k, v in node_data.items())
                return f"Node properties: {node_properties}"

            # Check if the result is from the semantic search
            elif isinstance(result, tuple):
                node, score = result
                node_data = node.get_properties()
                node_properties = ", ".join(f"{k}: {v}" for k, v in node_data.items())
                return f"Node properties (score: {score}): {node_properties}"

            # If the result is not in the expected format, raise an error
            else:
                raise ValueError(f"Unexpected result format: {result}")

        except Exception as e:
            # Handle any exceptions that may occur during processing
            return f"Error processing result: {str(e)}"


    def _arun(self, query: str) -> str:
        raise NotImplementedError("This tool does not support asynchronous execution.")