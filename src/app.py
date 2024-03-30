import streamlit as st
from openai import OpenAI as ai
from bs4 import BeautifulSoup

from langchain_core.messages import AIMessage, HumanMessage

from utils.logger import get_logger
from config import NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD, OPENAI_API_KEY
from services.document_processing import get_vectorstore_from_url, summarize_content
from services.openai_services import get_context_retriever_chain, get_conversational_rag_chain
from services.neo4j_services import process_and_add_url_to_graph, consume_bookmarks, ask_neo4j, setup_database_constraints, store_keywords_in_db, add_page_to_category, add_keyword_to_page
from models import extract_keywords_from_summary, categorize_page_with_llm, Category



# system config
client = ai(api_key=OPENAI_API_KEY)

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


def process_url(url, process_button):
    if process_button and url:
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
                store_keywords_in_db(url, keywords)
                logger.info(f"Keywords extracted and stored for {url}.")
            else:
                logger.warning(f"No summary available for keyword extraction for {url}.")
            
            # Update or refresh the vector store based on the new content
            # this function is not currently used as a vector store in chat
            st.session_state.vector_store = get_vectorstore_from_url(url)
            st.sidebar.success(f"URL processed and categorized: {url}")
        else:
            # Log failure but do not halt the application
            logger.error(f"Failed to process and add metadata for {url}.")
            st.sidebar.error(f"Failed to process URL: {url}")

# deprecated
# def add_new_category(new_category_name, new_category_description, add_category_button):
#     if add_category_button and new_category_name:
#         try:
#             add_category_to_neo4j(new_category_name, new_category_description)
#             st.sidebar.success("Category added successfully!")
#             logger.info(f"Category '{new_category_name}' added.")
#         except Exception as e:
#             logger.error(f"Failed to add category '{new_category_name}': {e}", exc_info=True)
#             st.sidebar.error("Failed to add category.")

# This is a test feature
# def add_keyword_to_category(keyword, category_for_keyword, add_keyword_button):
#     if add_keyword_button and keyword and category_for_keyword:
#         try:
#             category = find_by_name(Category, category_for_keyword)
#             if category:
#                 category.add_keyword(keyword)
#                 category.save_to_neo4j()
#                 st.sidebar.success(f"Keyword '{keyword}' added to category '{category_for_keyword}'.")
#                 logger.info(f"Keyword '{keyword}' added to category '{category_for_keyword}'.")
#             else:
#                 st.sidebar.error(f"Category '{category_for_keyword}' not found.")
#         except Exception as e:
#             logger.error(f"Failed to add keyword '{keyword}' to category '{category_for_keyword}': {e}", exc_info=True)
#             st.sidebar.error("Failed to add keyword.")



def display_chat():
    logger.debug("Displaying chat interface")

    # Chat input
    user_query = st.text_input("Type your message here...", key="new_user_query")

    # Process and display new query if present
    if user_query:
        logger.debug(f"Received new user query: {user_query}")
        st.session_state.chat_history.append(HumanMessage(content=user_query))
        try:
            logger.debug("Asking Neo4j with the user query")
            response = ask_neo4j(query=user_query)
            if isinstance(response, dict) or isinstance(response, list):
                formatted_response = str(response)
            else:
                formatted_response = response
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

# This is a testing function and will be removed or changed later
# def setup_category_management():
#     logger.debug("Setting up category management UI")
#     with st.sidebar:
#         st.header("Category Management")
#         # UI for adding a new category
#         new_category_name = st.text_input("New Category Name", key="new_category_name")
#         new_category_description = st.text_area("Category Description", key="new_category_description")
#         add_category_button = st.button("Add New Category")

        # UI for adding keywords to an existing category (simplified for initial setup)
        # keyword = st.text_input("Keyword to add", key="keyword")
        # category_for_keyword = st.text_input("Category for Keyword", key="category_for_keyword")
        # add_keyword_button = st.button("Add Keyword")

    # return new_category_name, new_category_description, add_category_button, keyword, category_for_keyword, add_keyword_button


if 'setup_done' not in st.session_state:
    setup_database_constraints()
    st.session_state['setup_done'] = True

# App main flow
logger.info("App main flow starting")

url, process_button, uploaded_file = setup_sidebar()
initialize_session_state()

process_uploaded_bookmarks(uploaded_file)
process_url(url, process_button)

# new_category_name, new_category_description, add_category_button, keyword, category_for_keyword, add_keyword_button = setup_category_management()
# 
# add_new_category(new_category_name, new_category_description, add_category_button)
# add_keyword_to_category(keyword, category_for_keyword, add_keyword_button)
display_chat()

logger.info("App main flow completed")