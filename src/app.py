import streamlit as st
import os
import json
import requests
import logging
from datetime import datetime
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from db import Neo4jConnection
from langchain_community.vectorstores import Chroma
from langchain_core.messages import AIMessage, HumanMessage
from langchain_community.document_loaders import WebBaseLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain.chains import create_history_aware_retriever, create_retrieval_chain
from langchain.chains.combine_documents import create_stuff_documents_chain

# system config
load_dotenv()
NEO4J_CONNECTION_FILE = os.getenv('NEO4J_CONNECTION_FILE')

# Configure basic logging
logging.basicConfig(level=logging.DEBUG,
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def generate_chat_messages_with_context(user_query, document_summary):
    messages = [
        {"role": "system", "content": "The following is a summary of the document content:"},
        {"role": "assistant", "content": document_summary},
        {"role": "user", "content": user_query}
    ]
    return messages


def chat_completion(messages, model="gpt-3.5-turbo", override_params=None):
    """
    Generates a completion using the chat API with a sequence of messages.
    """
    logger.debug(f"Generating chat completion with model {model}. Messages: {messages}")
    
    api_params = {"model": model, "messages": messages}
    
    if override_params:
        api_params.update(override_params)
        logger.debug(f"Override parameters applied: {override_params}")

    client = ChatOpenAI()

    try:
        completion = client.chat.completions.create(**api_params)
        logger.debug(f"Chat completion successful. Response: {completion}")
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
        {"role": "system", "content": "You are a summarizing assistant, providing concise summary of provided content."},
        {"role": "user", "content": document_content}
    ]

    logger.debug(f"Summarizing content with model {model}. Content: {document_content[:100]}...")  # Log first 100 characters to avoid clutter

    client = ChatOpenAI()
    response = chat_completion(messages, model=model, override_params=override_params)
    
    if "error" in response:
        logger.error(f"Error in summarizing content: {response['error']}")
        return response["error"]
    
    try:
        summary = response.choices[-1].message["content"].strip()
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


# Talk to data
def get_context_retriever_chain(vector_store):
    logger.debug("Initializing context retriever chain.")
    llm = ChatOpenAI()
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
    llm = ChatOpenAI()

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
    # Step 1: Extract Page Content and Title
    response = requests.get(url)
    soup = BeautifulSoup(response.content, 'html.parser')
    page_content = ' '.join(p.get_text() for p in soup.find_all('p'))  # Simplified content extraction
    page_title = soup.title.string if soup.title else "No Title"

    # Step 2: Generate Summary
    summary = summarize_content(page_content)

    # Step 3: Extract Metadata
    # For the date, we're using the current retrieval date as a placeholder
    date_created = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Step 4: Compile JSON Object
    page_metadata = {
        "url": url,
        "page_title": page_title,
        "summary": summary,
        "date_created": date_created
    }

    return json.dumps(page_metadata, indent=4)

# TODO: Fix add_page_metadata_to_graph to make better use of page_metadata properties

def add_page_metadata_to_graph(page_metadata):
    """
    Adds a node to the Neo4j graph with properties derived from page metadata.

    Parameters:
    page_metadata (dict): A dictionary containing page metadata.
    """
    driver = Neo4jConnection.get_driver()
    with driver.session() as session:
        # Define a Cypher query to create a node with properties
        query = """
        CREATE (p:Page {
            url: $url,
            title: $page_title,
            summary: $summary,
            dateCreated: $date_created
        })
        RETURN id(p) AS node_id
        """
        # Parameters need to be passed explicitly rather than as a single dict
        parameters = {
            "url": page_metadata["url"],
            "page_title": page_metadata["page_title"],
            "summary": page_metadata["summary"],
            "date_created": page_metadata["date_created"]
        }
        # Run the query with parameters
        result = session.run(query, parameters)
        node_id = result.single()["node_id"]
        print(f"Node created with ID: {node_id}")



def preprocess_summary(summary):
    # Placeholder for any pre-processing steps that might be needed
    # For now, we'll just return the summary as is
    return summary

def extract_summary_from_response(response):
    # Placeholder for logic to extract the summary from the OpenAI API response
    # Assuming the response is a dictionary with a 'choices' key that contains a list of choices,
    # where each choice is a dictionary with a 'text' key
    return response.choices[0].text.strip()


def postprocess_summary(summary):
    # Placeholder for any post-processing steps that might be needed
    # For now, we'll just return the summary as is
    return summary


# Neo4j Graph DB


# test function

def process_url_and_add_to_graph(url):
    
    vector_store = get_vectorstore_from_url(url) 

    if vector_store:
        # Here, adapt the logic based on how you're implementing content summarization
        # For demonstration, assuming direct content is available for summarization
        document_content = vector_store.get_document_content() 
        summary = summarize_content(document_content)

        # Create metadata JSON; adapt as necessary
        page_metadata = create_url_metadata_json({
            "url": url,
            "page_title": "Extracted or Placeholder Title", 
            "summary": summary,
            "date_created": "YYYY-MM-DD"  # Consider generating or extracting an actual date
        })

        # Add to Neo4j graph
        add_page_metadata_to_graph(page_metadata)

        st.sidebar.success("Page processed and added to graph.")
    else:
        st.sidebar.error("Failed to process URL.")



# App config
st.set_page_config(page_title="Chat with websites")
st.title("Chat with websites")


# sidebar
with st.sidebar:
    st.header("Settings")
    url = st.text_input("Website URL")
    process_button = st.sidebar.button("Process URL")

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


    user_query = st.chat_input("Type your message here...")
    if user_query is not None and user_query != "":
        response = get_response(user_query)
        
        if "answer" in response:
            st.session_state.chat_history.append(HumanMessage(content=user_query))
            st.session_state.chat_history.append(AIMessage(content=response["answer"]))
        else:
            print("The expected 'answer' key is not found in the response.")

    # conversation
    for message in st.session_state.chat_history:
        if isinstance(message, AIMessage):
            with st.chat_message("AI"):
                st.write(message.content)
        elif isinstance(message, HumanMessage):
            with st.chat_message("Human"):
                st.write(message.content)

