import streamlit as st
from langchain_core.messages import AIMessage, HumanMessage
from services.neo4j_services import consume_bookmarks, process_and_add_url_to_graph, ask_neo4j
from services.document_processing import get_vectorstore_from_url


def setup_sidebar():
    st.sidebar.header("Settings")
    url = st.sidebar.text_input("Website URL")
    process_button = st.sidebar.button("Process URL")
    uploaded_file = st.sidebar.file_uploader("Upload bookmarks HTML file", type="html")

    if uploaded_file is not None:
        consume_bookmarks(uploaded_file)
        st.sidebar.success("Bookmarks processed!")

    return url, process_button

def initialize_session_state():
    if "chat_history" not in st.session_state:
        st.session_state.chat_history = [{"type": "AI", "content": "Hello, I am Marvin, your personal librarian. How can I assist you today?"}]

def process_url(url):
    if url:
        # Here, you might want to add URL processing logic
        process_and_add_url_to_graph(url)
        st.session_state.vector_store = get_vectorstore_from_url(url)

def handle_user_query():
    user_query = st.text_input("Type your message here...")
    if user_query:
        st.session_state.chat_history.append({"type": "Human", "content": user_query})
        try:
            response = ask_neo4j(question=user_query)
            st.session_state.chat_history.append({"type": "AI", "content": f"Based on your bookmarks, {response}"})
        except Exception as e:
            st.session_state.chat_history.append({"type": "AI", "content": "Sorry, I couldn't find anything relevant to your query."})

def display_chat():
    for message in st.session_state.chat_history:
        if message["type"] == "AI":
            st.info(message["content"])
        elif message["type"] == "Human":
            st.success(message["content"])


# App main flow
# initialize_session_state()
# url, process_button = setup_sidebar()

# if process_button:
#     process_url(url)

# handle_user_query()
# display_chat()