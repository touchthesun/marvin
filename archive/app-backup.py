import streamlit as st
from openai import OpenAI as ai
from langchain_core.messages import AIMessage, HumanMessage

from utils.logger import get_logger
from utils.signal_handler import setup_signal_handling
from config import load_config
from db import Neo4jConnection
from services.document_processing import summarize_content
from services.openai_services import get_context_retriever_chain, get_conversational_rag_chain
from services.neo4j_services import process_and_add_url_to_graph, consume_bookmarks, setup_database_constraints, add_page_to_category, query_graph
from models import extract_keywords_from_summary, categorize_page_with_llm, process_page_keywords, store_keywords_in_db

# system config
config = load_config()
client = ai(api_key=config["openai_api_key"])

# Instantiate logging
logger = get_logger(__name__)


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

def format_search_results(search_results):
    if not search_results:
        return "No relevant results found."
    
    formatted_results = "Based on your query, here are some relevant results:\n"
    for i, doc in enumerate(search_results, start=1):
        title = doc.metadata.get("title", "No title")
        url = doc.metadata.get("url", "No URL provided")
        formatted_results += f"{i}. {title}\nURL: {url}\n"
    
    return formatted_results


def setup_sidebar():
    logger.debug("Setting up sidebar")
    with st.sidebar:
        st.header("Settings")
        url = st.text_input("Website URL")
        process_button = st.button("Process URL")
        uploaded_file = st.file_uploader("Upload bookmarks HTML file", type="html")

    logger.debug(f"URL: {url}, Process button clicked: {process_button}, File uploaded: {uploaded_file is not None}")
    return url, process_button, uploaded_file

def initialize_session_state():
    if "chat_history" not in st.session_state:
        logger.debug("Initializing chat history in session state")
        st.session_state.chat_history = [AIMessage(content="Hello, I am Marvin, your personal librarian. How can I assist you today?")]


def process_uploaded_bookmarks(uploaded_file):
    if uploaded_file is not None:
        logger.debug("Processing uploaded bookmarks file")
        consume_bookmarks(uploaded_file)
        st.sidebar.success("Bookmarks processed!")


# TODO remove process_button logic from this function so it is context agnostic


def process_url(url):
    logger.debug(f"Processing URL: {url}")
    # First, process the URL and add its metadata to the graph
    metadata_success = process_and_add_url_to_graph(url)

    if metadata_success:
        logger.info(f"Successfully added metadata for {url} to the graph.")
        
        # Categorize the page using an LLM
        categories = categorize_page_with_llm(url)

        # Store relationships between the page and its categories
        for category_name in categories:
            add_page_to_category(url, category_name)
            logger.info(f"Page {url} added to Category {category_name}.")

        # Extract the page's summary for keyword extraction
        # TODO find a more efficient way to cache summary instead of generating it in multiple parts of the app
        summary = summarize_content(url)
        
        if summary:
            # Extract and store keywords based on the summary
            keywords = extract_keywords_from_summary(summary)
            process_page_keywords(url, summary)
            store_keywords_in_db(url, keywords)
            logger.info(f"Keywords extracted and stored for {url}.")
        else:
            logger.warning(f"No summary available for keyword extraction for {url}.")
        
    else:
        # Log failure but do not halt the application
        logger.error(f"Failed to process and add metadata for {url}.")
        st.sidebar.error(f"Failed to process URL: {url}")



def display_chat():
    logger.debug("Displaying chat interface")

    # Chat input
    user_query = st.text_input("Type your message here...", key="new_user_query")

    if user_query:
        logger.info(f"Received new user query: '{user_query}'")
        st.session_state.chat_history.append(HumanMessage(content=user_query))
        
        try:
            logger.debug("Asking Neo4j with the user query")
            neo4j_graph = Neo4jConnection.get_graph()
            model_name = 'gpt-4-1106-preview'
            response = query_graph(user_query, model_name, neo4j_graph)
            logger.debug(f"Neo4j response: {response}")
            
            if response and 'result' in response:
                formatted_response = response['result']
            else:
                formatted_response = "Sorry, I couldn't find anything relevant to your query."

            st.session_state.chat_history.append(AIMessage(content=formatted_response))
        except Exception as e:
            logger.error("Error during asking Neo4j", exc_info=True)
            st.session_state.chat_history.append(AIMessage(content="Sorry, I couldn't find anything relevant to your query."))

    # Display all messages in chat history
    for message in st.session_state.chat_history:
        if isinstance(message, AIMessage):
            st.info(message.content)
        elif isinstance(message, HumanMessage):
            st.success(message.content)


if 'setup_done' not in st.session_state:
    setup_database_constraints()
    st.session_state['setup_done'] = True



def main():
    logger.info("App main flow starting")
    setup_signal_handling()  # Set up signal handling for graceful shutdown

    url, process_button, uploaded_file = setup_sidebar()
    initialize_session_state()
    if process_button and url:
        process_url(url)
    process_uploaded_bookmarks(uploaded_file)
    display_chat()

    logger.info("App main flow completed")

if __name__ == "__main__":
    main()