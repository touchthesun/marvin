import streamlit as st
from bs4 import BeautifulSoup
from datetime import datetime

from langchain.chains import GraphCypherQAChain
from langchain_openai import ChatOpenAI
from langchain_openai import OpenAIEmbeddings
from langchain_community.vectorstores import Neo4jVector

from utils.logger import get_logger
from config import load_config
from db import Neo4jConnection
from services.metadata import create_url_metadata_json
from services.openai_services import generate_embeddings
from services.document_processing import extract_site_name


# Instantiate and config
config = load_config()
logger = get_logger(__name__)
model_name = 'gpt-4-1106-preview'


def setup_database_constraints():
    """
    Sets up database constraints, ensuring uniqueness for Category and Keyword names.
    """
    constraints_query = [
        "CREATE CONSTRAINT unique_category_name IF NOT EXISTS FOR (c:Category) REQUIRE c.name IS UNIQUE",
        "CREATE CONSTRAINT unique_keyword_name IF NOT EXISTS FOR (k:Keyword) REQUIRE k.name IS UNIQUE"
    ]
    for query in constraints_query:
        Neo4jConnection.execute_query(query)
    logger.info("Database constraints successfully set up.")


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


def compare_metadata(new_metadata, existing_metadata):
    return new_metadata != existing_metadata

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
            # Further logic for comparison and potential update
            logger.info("Metadata comparison is enabled.")
        else:
            logger.info("Metadata comparison is disabled. Skipping comparison.")
    else:
        logger.info(f"URL does not exist in the graph. Processing: {url}")
        new_metadata = create_url_metadata_json(url)
        add_page_metadata_to_graph(new_metadata)



def process_and_add_url_to_graph(url):
    try:
        page_metadata = create_url_metadata_json(url)
        if page_metadata:  # Ensure page_metadata is not empty or null
            add_page_metadata_to_graph(page_metadata)
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


def setup_existing_graph_vector_store():
    try:        
        # Load environment variables
        uri = config["neo4j_uri"]
        username = config["neo4j_username"]
        password = config["neo4j_password"]
        
        logger.info("Setting up existing graph vector store with Neo4j database.")
        
        vector_index = Neo4jVector.from_existing_graph(
            embedding=OpenAIEmbeddings(),
            url=uri,
            username=username,
            password=password,
            index_name="page_index",
            node_label="Page",
            text_node_properties=["title", "summary"],
            embedding_node_property="embedding",
        )
        logger.info("Existing graph vector store setup complete.")
        return vector_index
    except Exception as e:
        logger.error(f"Failed to setup existing graph vector store: {e}")


def add_page_metadata_to_graph(page_metadata):
    """
    Adds a node to the Neo4j graph with properties derived from page metadata,
    and links it to a Site node representing its source website.
    """
    try:
        # Initialize the embeddings model
        embeddings_model = OpenAIEmbeddings()
        
        # Extract metadata
        url = page_metadata["url"]
        title = page_metadata.get("title", "Unknown Title")
        summary = page_metadata.get("summary", "No summary available")
        author = page_metadata.get("author", "Unknown Author")
        publication_date = page_metadata.get("publication_date", "Unknown Date")
        date_created = page_metadata.get("date_created", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
        site_name = extract_site_name(url)
        
        # Generate embeddings
        title_embedding = generate_embeddings(embeddings_model, title)
        summary_embedding = generate_embeddings(embeddings_model, summary)
        
        # Query to create the node with new fields and link it to a Site node
        query = """
            MERGE (s:Site {name: $site_name})
            MERGE (p:Page {url: $url})
            ON CREATE SET p.title = $title, p.summary = $summary, p.author = $author,
                            p.publication_date = $publication_date, p.dateCreated = $date_created,
                            p.title_embedding = $title_embedding, p.summary_embedding = $summary_embedding
            ON MATCH SET p.title = $title, p.summary = $summary, p.author = $author,
                            p.publication_date = $publication_date, p.dateCreated = $date_created,
                            p.title_embedding = $title_embedding, p.summary_embedding = $summary_embedding
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
            "title_embedding": title_embedding,
            "summary_embedding": summary_embedding
        }

        node_id = Neo4jConnection.execute_query(query, parameters)
        logger.info(f"Page node linked to Site '{site_name}' with ID: {node_id}")
        return {'success': True, 'node_id': node_id}

    except Exception as e:
        logger.error(f"Failed to process URL {url}: {e}", exc_info=True)
        return {'error': str(e)}



def consume_bookmarks(uploaded_file):
    """
    Processes bookmarks from an uploaded HTML file, extracting URLs and their titles,
    and then processing each URL using the process_url_submission function to either
    add or update its metadata in the Neo4j database.
    """
    # Read content from the uploaded file
    bookmarks_html = uploaded_file.getvalue().decode("utf-8")
    soup = BeautifulSoup(bookmarks_html, 'html.parser')
    bookmarks = soup.find_all('a')
    
    for bookmark in bookmarks:
        url = bookmark.get('href')
        if not url:
            logger.error("Bookmark without URL found.")
            continue
        title = bookmark.get_text()
        logger.info(f"Processing bookmark '{title}': {url}")

        # Use process_url_submission to handle each URL
        process_url_submission(url)

    logger.info("Finished processing all bookmarks.")


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



def query_graph(user_input, model_name, neo4j_graph):
    # max_tokens = config["max_tokens"]
    # logger.debug(f"Using max_tokens: {max_tokens}")
    logger.info(f"Initializing language model: {model_name}...")
    llm = ChatOpenAI(temperature=0, model=model_name)

    logger.info("Initializing GraphCypherQAChain with graph and language model...")
    cypher_chain = GraphCypherQAChain.from_llm(cypher_llm=llm, qa_llm=llm, graph=neo4j_graph, verbose=True)

    logger.info("Preparing combined input for query...")
    # combined_input = truncate_chat_history(st.session_state.chat_history, user_input, max_tokens)

    # logger.debug(f"Combined input for query: {combined_input}")

    logger.info("Executing graph query...")
    try:
        response = cypher_chain.invoke({"query": user_input})
        logger.info(f"Graph query response: {response}")

        return response
    except Exception as e:
        logger.error(f"Error during graph query execution: {e}")
        return {"error": str(e)}


# def truncate_chat_history(chat_history, new_input, max_tokens):
#     # This function concatenates chat history and new input into a single string limited by max_tokens
#     max_tokens = int(max_tokens) if max_tokens is not None else None
#     combined_input = []
#     for msg in chat_history:
#         # Check if the message is a dictionary and access content appropriately
#         if isinstance(msg, dict):
#             content = msg.get('content', '')  # Safely get content if it's a dictionary
#         else:
#             content = getattr(msg, 'content', '')  # Safely get content attribute if it's an object
#         combined_input.append(content)
#     combined_input.append(new_input)
#     # Join all parts and truncate if necessary to fit within max_tokens
#     return "\n".join(combined_input)[:max_tokens]


# experimental

# def fetch_segmented_data(query, params, segment_key, limit=100):
#     """
#     Fetches data from Neo4j in segmented form based on the provided segment key.

#     Args:
#     - query (str): The Cypher query to execute.
#     - params (dict): Parameters for the Cypher query.
#     - segment_key (str): The attribute used to segment the data.
#     - limit (int): The number of records per segment.

#     Returns:
#     - List[dict]: A list of data segments from the database.
#     """
#     segments = []
#     offset = 0

#     # Initialize the Neo4j graph connection
#     graph = Neo4jConnection.get_graph()

#     # Modify the query to include pagination
#     paginated_query = f"{query} RETURN properties(n) ORDER BY n.{segment_key} SKIP $offset LIMIT $limit"

#     while True:
#         # Execute the query
#         result = graph.query(paginated_query, {**params, 'offset': offset, 'limit': limit})
#         if not result:
#             break  # Break if no more data is returned

#         # Process results and append to segments
#         segments.extend(result)
#         offset += limit

#     return segments
