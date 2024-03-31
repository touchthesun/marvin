import os
import json
import streamlit as st
from bs4 import BeautifulSoup
from datetime import datetime

from langchain.chains import GraphCypherQAChain
from langchain_openai import ChatOpenAI
from langchain_community.graphs import Neo4jGraph
from langchain_openai import OpenAIEmbeddings
from langchain_community.vectorstores import Neo4jVector

from utils.logger import get_logger
from config import NEO4J_PASSWORD, NEO4J_URI, NEO4J_USERNAME, ENABLE_METADATA_COMPARISON
from db import Neo4jConnection
from services.metadata import create_url_metadata_json
from services.openai_services import generate_embeddings, get_model_parameters
from services.document_processing import extract_site_name


# Instantiate logger
logger = get_logger(__name__)

# Initialize models
model_name = 'gpt-4-1106-preview'
# current_dir = os.path.dirname(os.path.realpath(__file__))
# model_reference_data_path = os.path.join(os.path.dirname(__file__), '..', 'model_reference_data.json')
# with open(model_reference_data_path, 'r') as file:
#     model_reference_data = json.load(file)
# max_tokens, context_window = get_model_parameters(model_name, model_reference_data)
neo4j_graph = Neo4jGraph(url=NEO4J_URI, username=NEO4J_USERNAME, password=NEO4J_PASSWORD)
llm = ChatOpenAI(temperature=0, model=model_name)
graph_cypher_qa_chain = GraphCypherQAChain.from_llm(llm=llm, graph=neo4j_graph, verbose=True)



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


def ask_neo4j(query: str, top_k: int = 10):
    """
    Queries the Neo4j database using natural language via the GraphCypherQAChain.
    
    Parameters:
    - question (str): The natural language question to query the database.
    - top_k (int): The maximum number of results to return.

    Returns:
    - Dict[str, Any]: The query result.
    """
    logger.debug(f"Querying Neo4j with: '{query}', Top K: {top_k}")

    # Construct the input dictionary expected by `invoke`
    input_dict = {
        'query': query,
        'top_k': top_k
    }
    
    try:
        response = graph_cypher_qa_chain.invoke(input=input_dict)
        logger.debug(f"GraphCypherQAChain response: {response}")
        return response
    except Exception as e:
        logger.error("Failed to invoke GraphCypherQAChain", exc_info=True)
        raise

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
        if ENABLE_METADATA_COMPARISON:
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
        uri = NEO4J_URI
        username = NEO4J_USERNAME
        password = NEO4J_PASSWORD
        
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

    try:
        node_id = Neo4jConnection.execute_query(query, parameters)
        logger.info(f"Page node linked to Site '{site_name}' with ID: {node_id}")
    except Exception as e:
        logger.error(f"Failed to process URL {url}: {e}", exc_info=True)


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



# experimental

def query_graph(user_input, model_name=model_name):
    # Load model reference data
    # model_reference_data = json.load(open('model_reference_data.json'))

    # Get max_tokens and context_window for the selected model
    # max_tokens, _ = get_model_parameters(model_name, model_reference_data)
    # Setting hardcoded max_tokens for simplicity
    max_tokens = 4096
    logger.debug(f"Using max_tokens: {max_tokens}")

    # Initialize the Neo4j graph connection
    logger.info("Initializing Neo4j graph connection...")
    graph = Neo4jGraph(url=NEO4J_URI, username=NEO4J_USERNAME, password=NEO4J_PASSWORD)
    
    # Initialize the language model
    logger.info(f"Initializing language model: {model_name}...")
    llm = ChatOpenAI(temperature=0, model=model_name)

    # Initialize the GraphCypherQAChain with both the graph and language model
    logger.info("Initializing GraphCypherQAChain with graph and language model...")
    cypher_chain = GraphCypherQAChain.from_llm(
        cypher_llm=llm,
        qa_llm=llm,
        graph=graph,
        verbose=True,
    )

    # Prepare the input by concatenating recent chat history and the new user input
    logger.info("Preparing combined input for query...")
    combined_input = truncate_chat_history(st.session_state.chat_history, user_input, max_tokens)
    logger.debug(f"Combined input for query: {combined_input}")
    
    # Execute the query using the combined input
    logger.info("Executing graph query...")
    response = cypher_chain.invoke({"query": combined_input})
    logger.info(f"Graph query response: {response}")

    return response

def truncate_chat_history(chat_history, new_input, max_tokens=8192):
    """
    Truncate the chat history to ensure the total input length does not exceed max_tokens.
    This method ensures that the combined input of chat history and new query 
    fits within the model's maximum context window by trimming older messages first.
    """
    # Attempt to generate combined input
    combined_input = "\n".join([msg.content for msg in chat_history] + [new_input])
    
    # Count tokens in the combined input
    # This is a simplified count; consider using a tokenizer for accurate token counts
    token_count = len(combined_input.split())
    
    # While the token count exceeds the max_tokens limit, remove the oldest messages
    while token_count > max_tokens and chat_history:
        # Remove the oldest message
        chat_history.pop(0)
        # Recalculate combined_input and token_count
        combined_input = "\n".join([msg.content for msg in chat_history] + [new_input])
        token_count = len(combined_input.split())
    
    return combined_input
