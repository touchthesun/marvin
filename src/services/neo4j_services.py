import streamlit as st
from bs4 import BeautifulSoup
from datetime import datetime

from langchain_openai import OpenAIEmbeddings
from langchain_community.vectorstores import Neo4jVector

from utils.logger import get_logger
from config import load_config
from db import Neo4jConnection
from services.metadata import create_url_metadata_json
from services.document_processing import extract_site_name



# Instantiate and config
config = load_config()
logger = get_logger(__name__)
model_name = config["model_name"]


def setup_database_constraints():
    """
    Sets up database constraints, ensuring uniqueness for Category, Keyword, Site, and Page names/URLs.
    """
    constraints_query = [
        "CREATE CONSTRAINT unique_category_name IF NOT EXISTS FOR (c:Category) REQUIRE c.name IS UNIQUE",
        "CREATE CONSTRAINT unique_keyword_name IF NOT EXISTS FOR (k:Keyword) REQUIRE k.name IS UNIQUE",
        "CREATE CONSTRAINT site_name_unique IF NOT EXISTS FOR (s:Site) REQUIRE s.site_name IS UNIQUE",
        "CREATE CONSTRAINT url_unique IF NOT EXISTS FOR (p:Page) REQUIRE p.url IS UNIQUE",
    ]
    for query in constraints_query:
        Neo4jConnection.execute_query(query)
    logger.info("Database constraints successfully set up.")

def setup_database_indexes():
    """
    Sets up database indexes for efficient querying of node properties.
    """
    indexes_query = [
        "CREATE INDEX site_name_index IF NOT EXISTS FOR (s:Site) ON (s.site_name)",
        "CREATE INDEX url_index IF NOT EXISTS FOR (p:Page) ON (p.url)",
        "CREATE INDEX title_index IF NOT EXISTS FOR (p:Page) ON (p.title)",
        "CREATE INDEX summary_index IF NOT EXISTS FOR (p:Page) ON (p.summary)",
        "CREATE INDEX author_index IF NOT EXISTS FOR (p:Page) ON (p.author)",
        "CREATE INDEX publication_date_index IF NOT EXISTS FOR (p:Page) ON (p.publication_date)",
        "CREATE INDEX date_created_index IF NOT EXISTS FOR (p:Page) ON (p.date_created)",
        "CREATE INDEX keyword_index IF NOT EXISTS FOR (k:Keyword) ON (k.name)",
        "CREATE INDEX category_index IF NOT EXISTS FOR (c:Category) ON (c.name)",
    ]
    for query in indexes_query:
        Neo4jConnection.execute_query(query)
    logger.info("Database indexes successfully set up.")


# def check_user_database_exists(user_id):
#     """
#     Checks if a Neo4j database exists for the given user_id.
#     """
#     try:
#         query = "SHOW DATABASES"
#         result = Neo4jConnection.execute_query(query)
#         existing_databases = [row["name"] for row in result]
#         return user_id in existing_databases
#     except Exception as e:
#         logger.error(f"Failed to check if user database exists: {e}")
#         raise



def initialize_graph_database():
    """
    Initializes the Neo4j database.
    """
    try:
        uri = config["neo4j_uri"]
        username = config["neo4j_username"]
        password = config["neo4j_password"]

        # Set up database constraints and indexes
        setup_database_constraints()
        setup_database_indexes()

        # Get the Neo4j connection details
        url = uri
        username = username
        password = password

        retrieval_query = """
        CALL db.index.fulltext.queryNodes('node_index', $query + '~') 
        YIELD node, score
        RETURN node.title AS text, node.summary AS summary, score
        """

        # Initialize a vector store
        vector_store = Neo4jVector(
            embedding=OpenAIEmbeddings(),
            url=url,
            username=username,
            password=password,
            index_name="page_index",
            node_label="Page",
            text_node_properties = ["title"],
            embedding_node_property="embedding",
        )

        logger.info(f"Database and vector store initialized")
        return vector_store

    except Exception as e:
        logger.error(f"Failed to initialize database and vector store: {e}")
        raise

def setup_existing_graph_vector_store():
    try:        
        # Load environment variables
        uri = config["neo4j_uri"]
        username = config["neo4j_username"]
        password = config["neo4j_password"]
        
        logger.info("Setting up existing graph vector store with Neo4j database.")

        vector_store = Neo4jVector.from_existing_graph(
            embedding=OpenAIEmbeddings(),
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


def url_exists_in_graph(url):
    """
    Checks if a given URL already exists in the graph.
    """
    query = "MATCH (p:Page {url: $url}) RETURN p"
    parameters = {"url": url}
    result = Neo4jConnection.execute_query(query, parameters)
    return bool(result)


def get_existing_metadata(url):
    """
    Retrieves existing metadata for a given URL from the graph.
    """
    query = """
    MATCH (p:Page {url: $url})
    RETURN p.title AS title, p.summary AS summary, p.author AS author, p.publication_date AS publication_date
    """
    parameters = {"url": url}
    result = Neo4jConnection.execute_query(query, parameters)
    return dict(result[0]) if result else {}


def process_url_submission(url):
    """
    Processes a given URL submission by checking its existence in the graph,
    and comparing new metadata with existing metadata if necessary.
    """
    if url_exists_in_graph(url):
        logger.info(f"URL already exists in the graph: {url}")
        if config["enable_metadata_comparison"]:
            existing_metadata = get_existing_metadata(url)
            new_metadata = create_url_metadata_json(url)

            if existing_metadata != new_metadata:
                logger.info("Metadata has changed. Updating the graph...")
                add_page_to_graph(url, new_metadata)
                logger.info("Graph has been updated with new metadata.")
            else:
                logger.info("No changes in metadata. No update required.")
        else:
            logger.info("Metadata comparison is disabled. Skipping comparison.")
    else:
        logger.info(f"URL does not exist in the graph. Adding to graph: {url}")
        new_metadata = create_url_metadata_json(url)
        add_page_to_graph(url, new_metadata)
        logger.info("New URL and metadata added to the graph.")




def process_and_add_url_to_graph(url):
    try:
        page_metadata = create_url_metadata_json(url)
        if page_metadata:  # Ensure page_metadata is not empty or null
            add_page_to_graph(page_metadata)
            logger.info(f"Page metadata for {url} added to graph.")
            st.sidebar.success("Page processed and added to graph.")
            return True, page_metadata.get("summary", "")  # Return success flag and summary
        else:
            logger.warning(f"No metadata found or extracted for {url}.")
            st.sidebar.warning("No metadata found or extracted.")
            return False, ""  # Indicates failure due to missing metadata, no summary
    except Exception as e:
        logger.error(f"Failed to process URL {url}: {e}", exc_info=True)
        st.sidebar.error(f"Failed to process URL: {e}")
        return False, ""  # Indicates failure due to an exception, no summary





def add_page_to_graph(page_metadata):
    """
    Adds a node to the Neo4j graph with properties derived from page metadata,
    and links it to a Site node representing its source website.
    """
    try:
        # Extract metadata
        url = page_metadata["url"]
        title = page_metadata.get("title", "Unknown Title")
        summary = page_metadata.get("summary", "No summary available")
        author = page_metadata.get("author", "Unknown Author")
        publication_date = page_metadata.get("publication_date", "Unknown Date")
        date_created = page_metadata.get("date_created", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
        site_name = extract_site_name(url)
        
        # Query to create the node with new fields and link it to a Site node
        query = """
            MERGE (s:Site {name: $site_name})
            MERGE (p:Page {url: $url})
            ON CREATE SET p.title = $title, p.summary = $summary, p.author = $author,
                            p.publication_date = $publication_date, p.dateCreated = $date_created,
            ON MATCH SET p.title = $title, p.summary = $summary, p.author = $author,
                            p.publication_date = $publication_date, p.dateCreated = $date_created,
            MERGE (p)-[:FROM]->(s)
            RETURN id(p) AS node_id
            """
        parameters = {
            "site_name": site_name,
            "url": url,
            "title": title,
            "summary": summary,
            "author": author,
            "publication_date": publication_date,
            "date_created": date_created,
        }

        node_id = Neo4jConnection.execute_query(query, parameters)
        logger.info(f"Page node linked to Site '{site_name}' with ID: {node_id}")
        return {'success': True, 'node_id': node_id}

    except Exception as e:
        logger.error(f"Failed to process URL {url}: {e}", exc_info=True)
        return {'error': str(e)}



def add_page_to_category(page_url, category_name):
    """
    Creates a BELONGS_TO relationship between a Page and a Category in the Neo4j graph.
    """
    query = """
    MATCH (p:Page {url: $page_url})
    MERGE (c:Category {name: $category_name})
    MERGE (p)-[:BELONGS_TO]->(c)
    """
    parameters = {"page_url": page_url, "category_name": category_name}

    try:
        Neo4jConnection.execute_query(query, parameters)
        logger.info(f"Page {page_url} successfully added to Category {category_name}.")
    except Exception as e:
        logger.error(f"Failed to add Page {page_url} to Category {category_name}: {e}", exc_info=True)





# Query expansion/correction for GraphCypherQAChain
# Not currently being used
# def cypher_query_corrector(query, **kwargs):
#     expanded_query = f"""
#     CALL {{
#         WITH $query AS original_query
#         UNWIND original_query AS term
#         MATCH (k:Keyword)
#         WHERE k.name =~ term
#         RETURN DISTINCT k.name AS expanded_term
#         UNION
#         MATCH (c:Category)
#         WHERE c.name =~ term
#         RETURN DISTINCT c.name AS expanded_term
#         UNION
#         RETURN term AS expanded_term
#     }}
#     RETURN [x IN COLLECT(expanded_term) | x] AS expanded_queries
#     """
#     return expanded_query



# deprecated

# def query_graph(user_input, model_name):
#     logger.info(f"Fetching language model for: {model_name}...")
#     llm = Neo4jConnection.get_llm(model_name=model_name)

#     logger.info("Fetching GraphCypherQAChain with language model and graph...")
#     cypher_chain = Neo4jConnection.get_cypher_chain(llm)

#     logger.info("Executing graph query...")
#     try:
#         response = cypher_chain.invoke({"query": user_input})
#         logger.info(f"Graph query response: {response}")
#         return response
#     except Exception as e:
#         logger.error(f"Error during graph query execution: {e}")
#         return {"error": str(e)}