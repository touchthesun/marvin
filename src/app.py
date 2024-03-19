import os
import requests
import logging
import json
import streamlit as st
from openai import OpenAI as ai
from datetime import datetime
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from db import Neo4jConnection
from langchain.vectorstores import Neo4jVector
from langchain_community.vectorstores import Chroma
from langchain_community.graphs import Neo4jGraph
from langchain_core.messages import AIMessage, HumanMessage
from langchain_community.document_loaders import WebBaseLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain.chains import create_history_aware_retriever, create_retrieval_chain, GraphCypherQAChain
from langchain.chains.combine_documents import create_stuff_documents_chain

# system config
dotenv_path = os.path.join(os.path.dirname(__file__), '..', '.env')
load_dotenv(dotenv_path)
client = ai()

# Configure basic logging
logging.basicConfig(level=logging.DEBUG,
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def chat_completion(messages, model="gpt-3.5-turbo", override_params=None):
    """
    Generates a completion using the chat API with a sequence of messages.
    """
    logger.debug(f"Generating chat completion with model {model}. Messages: {messages}")
    
    api_params = {
        "model": model,
        "messages": messages,
    }
    
    if override_params:
        api_params.update(override_params)
        logger.debug(f"Override parameters applied: {override_params}")

    # Log the payload being sent to OpenAI
    print("Sending request to OpenAI with payload:", api_params)

    try:
        completion = client.chat.completions.create(**api_params)
        logger.debug(f"Chat completion successful. Response: {completion}")
        response = completion.choices[0].message.content
        print(response)
        return completion
        
    except Exception as e:
        logger.error(f"Chat completion failed with error: {e}")
        return {"error": str(e)}


def summarize_content(document_content, model="gpt-3.5-turbo", override_params=None):
    """
    Summarizes the given document content using the OpenAI chat API.
    """
    if not document_content:
        logger.warning("No content provided to summarize.")
        return "No content provided to summarize."
    
    messages = [
        {"role": "system", 
        "content": "You are a summarizing assistant, providing concise summary of provided content."},
        {"role": "user", 
        "content": document_content}
    ]

    logger.debug(f"Summarizing content with model {model}. Content: {document_content[:100]}...")  # Log first 100 characters to avoid clutter

    response = chat_completion(messages, model=model, override_params=override_params)

    if "error" in response:
        logger.error(f"Error in summarizing content: {response['error']}")
        return response["error"]
    
    try:
        summary = response.choices[0].message.content
        logger.debug(f"Content summarized successfully. Summary: {summary[:100]}...")  # Log first 100 characters
        return summary
    except (AttributeError, IndexError) as e:
        logger.error(f"Failed to extract summary from response. Error: {e}")
        return "Failed to extract summary from response."


# Get data
def get_vectorstore_from_url(url):
    logger.info(f"Loading document from URL: {url}")
    loader = WebBaseLoader(url)
    document = loader.load()

    if not document:
        logger.error("Failed to load document from URL.")
        return None

    logger.debug("Splitting document into chunks.")
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=250, chunk_overlap=20, length_function=len, is_separator_regex=False,
    )
    document_chunks = text_splitter.split_documents(document)

    logger.debug("Vectorizing document chunks.")
    embeddings = OpenAIEmbeddings()
    vector_store = Chroma.from_documents(document_chunks, embeddings)

    logger.info(f"Vector store created: {vector_store}")
    return vector_store


# This function should be replaced by one that uses Neo4j as vector store
def get_context_retriever_chain(vector_store):
    logger.debug("Initializing context retriever chain.")
    llm = ai()
    retriever = vector_store.as_retriever()
    logger.debug(f"Retriever based on vector store: {retriever}")

    prompt = ChatPromptTemplate.from_messages([
        MessagesPlaceholder(variable_name="chat_history"),
        ("user", "{input}"),
        ("user", "Given the above conversation, generate a search query to look up in order to get information relevant to the conversation")
    ])

    logger.debug(f"Using prompt template for retriever chain: {prompt}")
    retriever_chain = create_history_aware_retriever(llm, retriever, prompt)
    logger.debug(f"Context retriever chain created: {retriever_chain}")

    return retriever_chain



def get_conversational_rag_chain(retriever_chain):
    logger.debug("Initializing conversational RAG chain.")
    llm = ai()

    prompt = ChatPromptTemplate.from_messages([
        ("system", "Answer the user's questions based on the below context:\n\n{context}"),
        MessagesPlaceholder(variable_name="chat_history"),
        ("user", "{input}"),
    ])

    logger.debug(f"Using prompt template for conversational RAG chain: {prompt}")
    stuff_documents_chain = create_stuff_documents_chain(llm, prompt)
    logger.debug(f"Conversational RAG chain created: {stuff_documents_chain}")
    conversational_rag_chain = create_retrieval_chain(retriever_chain, stuff_documents_chain)
    logger.debug(f"Final conversational RAG chain: {conversational_rag_chain}")

    return conversational_rag_chain



def get_response(user_input):
    logger.info("Retrieving response for user input.")
    if "vector_store" not in st.session_state or st.session_state.vector_store is None:
        logger.error("Vector store is not initialized.")
        return "Error: Vector store is not initialized."

    retriever_chain = get_context_retriever_chain(st.session_state.vector_store)
    conversation_rag_chain = get_conversational_rag_chain(retriever_chain)

    logger.debug(f"Invoking conversation RAG chain with input: {user_input}")
    response = conversation_rag_chain.invoke({
        "chat_history": st.session_state.chat_history,
        "input": user_input
    })

    if response is None or 'error' in response:
        logger.error(f"Failed to get a response: {response}")
        return "Error: Failed to process your query."

    logger.info(f"Response successfully retrieved: {response}")
    return response


# Manage data

def create_url_metadata_json(url):
    """
    Extracts page content and title from a given URL, generates a summary,
    and compiles metadata into a dictionary.

    Parameters:
    url (str): URL of the webpage to process.

    Returns:
    dict: Dictionary containing page metadata.
    """
    try:
        response = requests.get(url)
        soup = BeautifulSoup(response.content, 'html.parser')
        page_content = ' '.join(p.get_text() for p in soup.find_all('p'))
        page_title = soup.title.string if soup.title else "No Title"

        summary = summarize_content(page_content)

        page_metadata = {
            "url": url,
            "page_title": page_title,
            "summary": summary,
            "date_created": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }

        return page_metadata
    except Exception as e:
        logger.error(f"Failed to create URL metadata for {url}: {e}")
        return {}


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


# Function to process URL and add metadata to graph
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
        # Instantiate Neo4j connection using the get_driver method
        driver = Neo4jConnection.get_driver()
        
        # Extract the necessary connection details from the driver
        uri = os.getenv("NEO4J_URI")
        username = os.getenv("NEO4J_USERNAME")
        password = os.getenv("NEO4J_PASSWORD")
        
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



def format_embedding_for_logging(embedding, preview_length=3):
    preview_start = ', '.join(map(str, embedding[:preview_length]))
    preview_end = ', '.join(map(str, embedding[-preview_length:]))
    return f"Embedding (length {len(embedding)}): [{preview_start} ... {preview_end}]"


def format_search_results(search_results):
    if not search_results:
        return "No relevant results found."
    
    formatted_results = "Based on your query, here are some relevant results:\n"
    for i, doc in enumerate(search_results, start=1):
        # Assuming 'doc.metadata' contains 'url' and 'title' keys
        title = doc.metadata.get("title", "No title")
        url = doc.metadata.get("url", "No URL provided")
        formatted_results += f"{i}. {title}\nURL: {url}\n"
    
    return formatted_results



# App config
st.set_page_config(page_title="Chat with websites")
st.title("Chat with websites")


# sidebar
with st.sidebar:
    st.header("Settings")
    url = st.text_input("Website URL")
    process_button = st.sidebar.button("Process URL")
    uploaded_file = st.file_uploader("Upload bookmarks HTML file", type="html")

if uploaded_file is not None:
    process_bookmarks_html_from_upload(uploaded_file)
    st.sidebar.success("Bookmarks processed!")

else:
    st.sidebar.info("Upload a bookmarks HTML file to get started.")

if url is None or url == "":
    st.info("Please enter a URL")

else:
    # session state
    if "chat_history" not in st.session_state:
        st.session_state.chat_history = [
            AIMessage(content="Hello, I am a bot. How can I help you?")
        ]
    if "vector_store" not in st.session_state:
        st.session_state.vector_store = get_vectorstore_from_url(url)

    if process_button:
        process_and_add_url_to_graph(url)

    user_query = st.chat_input("Type your message here...")
    if user_query is not None and user_query != "":
        try:
            search_results = search_graph(user_query, k=3)
            formatted_search_results = format_search_results(search_results)
            response = formatted_search_results
        except Exception as e:
            logger.error(f"An error occurred during the similarity search: {e}")
            response = "Sorry, I couldn't find anything relevant."

        st.session_state.chat_history.append(HumanMessage(content=user_query))
        st.session_state.chat_history.append(AIMessage(content=response))

    # conversation
    for message in st.session_state.chat_history:
        if isinstance(message, AIMessage):
            with st.chat_message("AI"):
                st.write(message.content)
        elif isinstance(message, HumanMessage):
            with st.chat_message("Human"):
                st.write(message.content)

