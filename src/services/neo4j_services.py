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
from config import NEO4J_PASSWORD, NEO4J_URI, NEO4J_USERNAME, ENABLE_METADATA_COMPARISON
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
    # Construct the input dictionary expected by `invoke`
    input_dict = {
        'query': query,
        'top_k': top_k
    }
    
    # Call `invoke` with the constructed input
    response = graph_cypher_qa_chain.invoke(input=input_dict)
    return response

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


def find_by_name(graph_object_class, name):
    """
    Finds an object by its name from the Neo4j database.

    Parameters:
    - graph_object_class: The class of the object, derived from GraphObject.
    - name (str): The name of the object to find.

    Returns:
    The found object or None if not found.
    """
    driver = Neo4jConnection.get_driver()
    try:
        with driver.session() as session:
            result = session.run(f"MATCH (n:{graph_object_class.__name__} {{name: $name}}) RETURN n", name=name).single()
            if result:
                logger.info(f"{graph_object_class.__name__} '{name}' found in Neo4j.")
                # Additional logging to inspect the graph_object_class and result
                logger.info(f"Inspecting {graph_object_class.__name__}: {graph_object_class}, result: {result[0]}")
                try:
                    # Attempt to use the inflate method
                    inflated_object = graph_object_class.inflate(result[0])
                    logger.info(f"Inflated object: {inflated_object}")
                    return inflated_object
                except AttributeError as e:
                    # Log the error if inflate is not found
                    logger.error(f"'{graph_object_class.__name__}' object has no attribute 'inflate': {e}")
                    return None
            else:
                logger.info(f"{graph_object_class.__name__} '{name}' not found in Neo4j.")
                return None
    except Exception as e:
        logger.error(f"Error finding {graph_object_class.__name__} '{name}' in Neo4j: {e}", exc_info=True)
        raise


# experimental features

def add_page_to_category(page_url, category_name):
    """
    Creates a BELONGS_TO relationship between a Page and a Category in the Neo4j graph.
    """
    query = """
    MATCH (p:Page {url: $page_url})
    MATCH (c:Category {name: $category_name})
    MERGE (p)-[:BELONGS_TO]->(c)
    """
    parameters = {"page_url": page_url, "category_name": category_name}

    try:
        Neo4jConnection.execute_query(query, parameters)
        logger.info(f"Page {page_url} successfully added to Category {category_name}.")
    except Exception as e:
        logger.error(f"Failed to add Page {page_url} to Category {category_name}: {e}", exc_info=True)


def store_keywords_in_db(page_url, keywords):
    """
    Adds each keyword in the list of keywords to the specified page in the Neo4j graph database.
    """
    for keyword in keywords:
        add_keyword_to_page(page_url, keyword)


def add_keyword_to_page(page_url, keyword_text):
    """
    Creates a HAS_KEYWORD relationship between a Page and some number of Keywords in the Neo4j Graph.
    """
    query = """
    MATCH (p:Page {url: $page_url})
    MERGE (k:Keyword {text: $keyword_text})
    MERGE (p)-[:HAS_KEYWORD]->(k)
    """
    parameters = {"page_url": page_url, "keyword_text": keyword_text}
    try: 
        Neo4jConnection.execute_query(query, parameters)
        logger.info(f"Keywords {keyword_text} successfully added to Page {page_url}.")
    except Exception as e:
        logger.error(f"Failed to add Keywords {keyword_text} to Page {page_url}: {e}", exc_info=True)

# deprecated. use services.category.store_categories instead
# def store_categories(page_url, categories):
#     query = """
#     MERGE (p:Page {url: $page_url})
#     SET p.categories = $categories
#     """
#     parameters = {"url": page_url, "categories": categories}
#     try: 
#         Neo4jConnection.execute_query(query, parameters)
#         logger.info(f"Categories {categories} successfully added to Page {page_url}")
#     except Exception as e:
#         logger.error(f"Failed to add Categories {categories} to Page {page_url}: {e}", exc_info=True)
