import streamlit as st
from bs4 import BeautifulSoup
from urllib.parse import urlparse
from datetime import datetime

from langchain.chains import GraphCypherQAChain
from langchain_openai import ChatOpenAI
from langchain_community.graphs import Neo4jGraph
from langchain_openai import OpenAIEmbeddings
from langchain_community.vectorstores import Neo4jVector

from utils.logger import get_logger
from config import NEO4J_PASSWORD, NEO4J_URI, NEO4J_USERNAME
from db import Neo4jConnection
from services.metadata import create_url_metadata_json
from services.openai_services import generate_embeddings
from services.document_processing import extract_site_name


# Instantiate logger
logger = get_logger(__name__)

# Initialize models
neo4j_graph = Neo4jGraph(url=NEO4J_URI, username=NEO4J_USERNAME, password=NEO4J_PASSWORD)
llm = ChatOpenAI(temperature=0)
graph_cypher_qa_chain = GraphCypherQAChain.from_llm(llm=llm, graph=neo4j_graph, verbose=True)


def setup_database_constraints():
    driver = Neo4jConnection.get_driver()
    with driver.session() as session:
        session.run("CREATE CONSTRAINT unique_category_name IF NOT EXISTS FOR (c:Category) REQUIRE c.name IS UNIQUE")
        session.run("CREATE CONSTRAINT unique_keyword_name IF NOT EXISTS FOR (k:Keyword) REQUIRE k.name IS UNIQUE")
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
    # Construct the input dictionary expected by `invoke`
    input_dict = {
        'query': query,
        'top_k': top_k
    }
    
    # Call `invoke` with the constructed input
    response = graph_cypher_qa_chain.invoke(input=input_dict)
    return response


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

# not currently in use
# def search_graph(query, k=1):
#     try:
#         logger.info("Performing similarity search with query: %s", query)
#         existing_graph = setup_existing_graph_vector_store()
#         results = existing_graph.similarity_search(query, k=k)
        
#         # Ensure results are in the expected format and iterate over them
#         for result in results:
#             # Access the Document object's properties correctly.
#             # Assuming 'result' is a Document object and it has a 'metadata' attribute
#             # which itself is a dictionary containing 'title' and 'url'.
#             title = result.metadata.get('title', 'No title')
#             url = result.metadata.get('url', 'No URL provided')
#             logger.info(f"Found: {title} at {url}")
        
#         logger.info("Similarity search complete.")
#         return results
#     except Exception as e:
#         logger.error("Failed to perform similarity search: %s", e)
#         raise


def add_page_metadata_to_graph(page_metadata):
    """
    Adds a node to the Neo4j graph with properties derived from page metadata,
    and links it to a Site node representing its source website.
    """
    # Initialize the embeddings model
    embeddings_model = OpenAIEmbeddings()
    
    # Extract metadata
    url = page_metadata["url"]
    title = page_metadata.get("title", "Unknown Title")  # Updated based on the new structure
    summary = page_metadata.get("summary", "No summary available")
    author = page_metadata.get("author", "Unknown Author")
    publication_date = page_metadata.get("publication_date", "Unknown Date")
    date_created = page_metadata.get("date_created", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    site_name = extract_site_name(url)
    
    try:
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

        # Instantiate Neo4j connection and run query
        driver = Neo4jConnection.get_driver()
        with driver.session() as session:
            result = session.run(query, parameters)
            node_id = result.single().get("node_id")
            logger.info(f"Page node linked to Site '{site_name}' with ID: {node_id}")
    except Exception as e:
        logger.error(f"Failed to process URL {url}: {e}", exc_info=True)



def consume_bookmarks(uploaded_file):
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
