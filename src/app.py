import streamlit as st
from openai import OpenAI as ai
from bs4 import BeautifulSoup

from langchain_core.messages import AIMessage, HumanMessage

from utils.logger import get_logger
from config import NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD, OPENAI_API_KEY
from services.document_processing import get_vectorstore_from_url
from services.openai_services import get_context_retriever_chain, get_conversational_rag_chain
from services.neo4j_services import search_graph, process_and_add_url_to_graph, process_bookmarks_html_from_upload

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
    # if "vector_store" not in st.session_state:
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

