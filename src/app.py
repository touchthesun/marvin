import streamlit as st
from openai import OpenAI as ai
from langchain_core.messages import AIMessage

from utils.logger import get_logger
from utils.signal_handler import setup_signal_handling
from config import load_config
from services.document_processing import summarize_content
from services.neo4j_services import process_and_add_url_to_graph, add_page_to_category, initialize_graph_database
from services.bookmarks import consume_bookmarks
from models import extract_keywords_from_summary, categorize_page_with_llm, process_page_keywords, store_keywords_in_db
from agent import initialize_agent

# system config
config = load_config()
client = ai(api_key=config["openai_api_key"])
model_name = config["model_name"]

# Instantiate logging
logger = get_logger(__name__)




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
    if 'agent_executor' not in st.session_state:
        # Initialize agent if not already done
        st.session_state.agent_executor = initialize_agent(model_name=config["model_name"])


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

    user_query = st.text_input("Type your message here...", key="new_user_query")
    if user_query:
        logger.info(f"Received new user query: '{user_query}'")
        st.session_state.chat_history.append({"role": "user", "content": user_query})

        # Use the agent to generate a response
        try:
            response = st.session_state.agent_executor({"input": user_query})
            st.session_state.chat_history.append({"role": "assistant", "content": response})
            logger.info(f"Agent response: {response}")
        except Exception as e:
            logger.error("Error during agent response generation", exc_info=True)
            response = "Sorry, I couldn't process your request."
            st.session_state.chat_history.append({"role": "assistant", "content": response})

    # Handle display based on message type
    for message in st.session_state.chat_history:
        if isinstance(message, dict):
            # Handle dictionary messages
            if message['role'] == 'assistant':
                st.info(message['content'])
            elif message['role'] == 'user':
                st.success(message['content'])
        else:
            # Handle AIMessage objects or other types
            content = getattr(message, 'content', "No content")
            role = getattr(message, 'role', "unknown")
            if role == 'assistant':
                st.info(content)
            else:
                st.success(content)



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



# Deprecated

# def get_response(user_input):
#     logger.info("Retrieving response for user input.")
#     if "vector_store" not in st.session_state or st.session_state.vector_store is None:
#         logger.error("Vector store is not initialized.")
#         return "Error: Vector store is not initialized."

#     retriever_chain = get_context_retriever_chain(st.session_state.vector_store)
#     conversation_rag_chain = get_conversational_rag_chain(retriever_chain)

#     logger.debug(f"Invoking conversation RAG chain with input: {user_input}")
#     response = conversation_rag_chain.invoke({
#         "chat_history": st.session_state.chat_history,
#         "input": user_input
#     })

#     if response is None or 'error' in response:
#         logger.error(f"Failed to get a response: {response}")
#         return "Error: Failed to process your query."

#     logger.info(f"Response successfully retrieved: {response}")
#     return response