import streamlit as st
from bs4 import BeautifulSoup

from langchain_community.graphs import Neo4jGraph
from langchain_openai import OpenAIEmbeddings
from langchain.vectorstores import Neo4jVector

from utils.logger import get_logger
from config import NEO4J_PASSWORD, NEO4J_URI, NEO4J_USERNAME
from db import Neo4jConnection
from services.document_processing import create_url_metadata_json


# Instantiate logger
logger = get_logger(__name__)


def process_and_add_url_to_graph(url):
    try:
        page_metadata = create_url_metadata_json(url)
        add_page_metadata_to_graph(page_metadata)
        logger.info(f"Page metadata for {url} added to graph.")
        st.sidebar.success("Page processed and added to graph.")
    except Exception as e:
        logger.error(f"Failed to process URL {url}: {e}")
        st.sidebar.error(f"Failed to process URL: {e}")


def setup_existing_graph_vector_store():
    try:        
        # Load environment variables
        uri = NEO4J_URI
        username = NEO4J_USERNAME
        password = NEO4J_PASSWORD
        
        logger.info("Setting up existing graph vector store with Neo4j database.")
        
        existing_graph = Neo4jVector.from_existing_graph(
            embedding=OpenAIEmbeddings(),
            url=uri,
            username=username,
            password=password,
            index_name="page_index",
            node_label="Page",
            text_node_properties=["title", "summary"],
            embedding_node_property="summary_embedding",
        )
        logger.info("Existing graph vector store setup complete.")
        return existing_graph
    except Exception as e:
        logger.error(f"Failed to setup existing graph vector store: {e}")


def search_graph(query, k=1):
    try:
        logger.info("Performing similarity search with query: %s", query)
        existing_graph = setup_existing_graph_vector_store()
        results = existing_graph.similarity_search(query, k=k)
        
        # Ensure results are in the expected format and iterate over them
        for result in results:
            # Access the Document object's properties correctly.
            # Assuming 'result' is a Document object and it has a 'metadata' attribute
            # which itself is a dictionary containing 'title' and 'url'.
            title = result.metadata.get('title', 'No title')
            url = result.metadata.get('url', 'No URL provided')
            logger.info(f"Found: {title} at {url}")
        
        logger.info("Similarity search complete.")
        return results
    except Exception as e:
        logger.error("Failed to perform similarity search: %s", e)
        raise

def add_page_metadata_to_graph(page_metadata):
    """
    Adds a node to the Neo4j graph with properties derived from page metadata.
    """
    # logger.info(f"Processing URL for graph addition: {page_metadata['url']}")

    # Extract metadata
    url = page_metadata["url"]
    title = page_metadata["page_title"]
    summary = page_metadata["summary"]
    date_created = page_metadata["date_created"]

    # Initialize the embeddings model
    embeddings_model = OpenAIEmbeddings()

    try:
        # Generate embeddings for the title and summary
        title_embedding = embeddings_model.embed_query(title)
        summary_embedding = embeddings_model.embed_query(summary)

        # Instantiate Neo4j connection
        driver = Neo4jConnection.get_driver()

        # Query to create the node with embeddings
        query = """
                CREATE (p:Page {
                    url: $url,
                    title: $title,
                    summary: $summary,
                    dateCreated: $date_created,
                    title_embedding: $title_embedding,
                    summary_embedding: $summary_embedding
                })
                RETURN id(p) AS node_id
                """
        parameters = {
            "url": url,
            "title": title,
            "summary": summary,
            "date_created": date_created,
            "title_embedding": title_embedding,
            "summary_embedding": summary_embedding
        }

        with driver.session() as session:
            result = session.run(query, parameters)
            node_id = result.single()["node_id"]
            logger.info(f"Node created with ID: {node_id}")
    except Exception as e:
        logger.error(f"Failed to process URL {url}: {e}")


def process_bookmarks_html_from_upload(uploaded_file):
    # Read content from the uploaded file
    bookmarks_html = uploaded_file.getvalue().decode("utf-8")
    soup = BeautifulSoup(bookmarks_html, 'html.parser')
    bookmarks = soup.find_all('a')
    
    for bookmark in bookmarks:
        url = bookmark['href']
        title = bookmark.text
        print(f"Processing {title}: {url}")

        # Generate metadata for URL
        metadata = create_url_metadata_json(url)
        if 'error' in metadata:
            print(f"Error processing {url}: {metadata['error']}")
            continue

        # Add metadata to Neo4j database
        try:
            add_page_metadata_to_graph(metadata)
            print(f"Successfully added {url} to Neo4j database.")
        except Exception as e:
            print(f"Error adding {url} to database: {e}")
