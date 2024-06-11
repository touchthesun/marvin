import logging
from config import load_config
from langchain.chains import GraphCypherQAChain
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain.memory import ConversationKGMemory, CombinedMemory, ConversationBufferWindowMemory
from langchain_community.graphs.neo4j_graph import Neo4jGraph
from langchain_community.vectorstores import Neo4jVector

# Config
config = load_config()
NEO4J_URI = config["neo4j_uri"]
NEO4J_USERNAME = config["neo4j_username"]
NEO4J_PASSWORD = config["neo4j_password"]

# Configure logging
logger = logging.getLogger(__name__)


class Neo4jConnection:
    _llm = None
    _cypher_chain = None
    _graph = None
    _vector_store = None
    _kg_memory = None
    _buffer_memory = None
    _openai_embeddings = None

    @classmethod
    def get_graph(cls):
        if cls._graph is None:
            if None in [NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD]:
                logger.error('One or more Neo4j environment variables are missing.')
                raise RuntimeError('Missing Neo4j environment variables.')
            try:
                cls._graph = Neo4jGraph(
                    url=NEO4J_URI,
                    username=NEO4J_USERNAME,
                    password=NEO4J_PASSWORD,
                )
                cls.check_connectivity()
                logger.info('Successfully connected to Neo4j.')
            except Exception as e:
                logger.error('Failed to connect to Neo4j: %s', e)
                raise
        return cls._graph

    @classmethod
    def _setup_vector_store(cls):
        if cls._vector_store is None:
            try:
                cls._vector_store = setup_existing_graph_vector_store()
                logger.info("Vector store setup successfully.")
            except Exception as e:
                logger.error(f"Failed to setup vector store: {e}")
                raise

    @classmethod
    def get_vector_store(cls):
        if cls._vector_store is None:
            cls._setup_vector_store()
        return cls._vector_store


    @classmethod
    def check_connectivity(cls):
        try:
            # Run a simple read query to check connectivity using the 'query' method
            result = cls._graph.query("RETURN 1 AS number")
            if result and result[0]['number'] == 1:
                logger.info("Connectivity check successful.")
            else:
                logger.error("Failed connectivity check.")
                raise RuntimeError("Connectivity test failed.")
        except Exception as e:
            logger.error(f"Failed connectivity check: {e}")
            raise RuntimeError("Unable to establish connection with Neo4j.")


    @classmethod
    def execute_query(cls, query, parameters=None):
        """Executes a Cypher query using the Neo4jGraph query method."""
        try:
            graph = cls.get_graph()
            result = graph.query(query, params=parameters)
            logger.debug(f"Query executed successfully: {query}")
            return result
        except Exception as e:
            logger.error(f"Failed to execute query: {query}, Error: {e}")
            raise

    @staticmethod
    def _execute_tx(tx, query, parameters):
        result = tx.run(query, parameters)
        return [record for record in result]


    @classmethod
    def get_llm(cls, model_name="gpt-4", max_tokens=config["max_tokens"]):
        if cls._llm is None:
            logger.info(f"Initializing language model: {model_name}...")
            cls._llm = ChatOpenAI(model_name=model_name, api_key=config["openai_api_key"], max_tokens=max_tokens)
        return cls._llm

    @classmethod
    def get_openai_embeddings(cls):
        """Singleton access to OpenAIEmbeddings."""
        if cls._openai_embeddings is None:
            logger.info("Initializing OpenAIEmbeddings...")
            cls._openai_embeddings = OpenAIEmbeddings(api_key=config["openai_api_key"])
            logger.info("OpenAIEmbeddings initialized.")
        return cls._openai_embeddings


    @classmethod
    def close_services(cls):
        if cls._graph:
            logger.info("Closing Neo4j graph...")
            cls._graph.close()
            cls._graph = None
        if cls._llm:
            logger.info("Resetting language model...")
            cls._llm = None
        if cls._cypher_chain:
            logger.info("Resetting GraphCypherQAChain...")
            cls._cypher_chain = None


def setup_existing_graph_vector_store():
    try:        
        # Load environment variables
        uri = NEO4J_URI
        username = NEO4J_USERNAME
        password = NEO4J_PASSWORD
        
        logger.info("Setting up existing graph vector store with Neo4j database.")
        openai_embeddings = Neo4jConnection.get_openai_embeddings()

        vector_store = Neo4jVector.from_existing_graph(
            embedding=openai_embeddings,
            url=uri,
            username=username,
            password=password,
            index_name="page_index",
            node_label="Page",
            text_node_properties = ["title"],
            embedding_node_property="embedding",
        )
        if vector_store is None:
            logger.error("Failed to create vector_store instance.")
            return None

        logger.info(f"Existing graph vector store setup complete. Index name: {vector_store.index_name}, Node label: {vector_store.node_label}")
        return vector_store
    except Exception as e:
        logger.error(f"Failed to setup existing graph vector store: {e}")



    # @classmethod
    # def get_cypher_chain(cls, llm):
    #     if cls._cypher_chain is None:
    #         graph = cls.get_graph()  # Ensure the driver is initialized
    #         cls._kg_memory = ConversationKGMemory(llm=llm)
    #         cls._buffer_memory = ConversationBufferWindowMemory(k=5)  # Keep the last 5 interactions
    #         combined_memory = CombinedMemory(memories=[cls._kg_memory, cls._buffer_memory])
    #         cls._cypher_chain = GraphCypherQAChain.from_llm(
    #             cypher_llm=llm,
    #             qa_llm=llm,
    #             graph=graph,
    #             verbose=True,
    #             memory=combined_memory
    #         )
    #         logger.info('GraphCypherQAChain initialized with graph, language model, and memory.')
    #     return cls._cypher_chain


    # @classmethod
    # def expand_and_correct_query(cls, original_query):
    #     # This uses an advanced Cypher query to find synonyms and expand the query
    #     query = """
    #     CALL {{
    #         WITH $original_query AS original_query
    #         MATCH (n:Synonym)-[:SYNONYM_OF]->(m:Term)
    #         WHERE n.term =~ ('.*' + original_query + '.*')
    #         RETURN DISTINCT m.term AS expanded_term
    #         UNION
    #         RETURN original_query AS expanded_term
    #     }}
    #     RETURN [x IN COLLECT(expanded_term) | x] AS expanded_queries
    #     """
    #     try:
    #         result = cls.execute_query(query, parameters={"original_query": original_query})
    #         expanded_queries = [record["expanded_queries"] for record in result]
    #         return expanded_queries
    #     except Exception as e:
    #         logger.error(f"Failed to expand and correct query: {e}")
    #         raise
