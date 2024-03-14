import streamlit as st
import os
import json
import requests
from datetime import datetime
from bs4 import BeautifulSoup
from openai import OpenAI
from dotenv import load_dotenv
from db import Neo4jConnection
from langchain_community.vectorstores import Chroma
# from langchain_community.graphs import Neo4jGraph
# from langchain.chains import GraphCypherQAChain
from langchain_core.messages import AIMessage, HumanMessage
from langchain_community.document_loaders import WebBaseLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain.chains import create_history_aware_retriever, create_retrieval_chain
from langchain.chains.combine_documents import create_stuff_documents_chain

# system config
load_dotenv()
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')
NEO4J_CONNECTION_FILE = os.getenv('NEO4J_CONNECTION_FILE')
# db_url = os.getenv("NEO4J_URI")
# db_username = os.getenv("NEO4J_USERNAME")
# db_password = os.getenv("NEO4J_PASSWORD")



client = OpenAI(api_key=OPENAI_API_KEY)

DEFAULT_API_PARAMS = {
    "model": "gpt-3.5-turbo",
    "temperature": 0.5,
    "max_tokens": 250,
    "top_p": 1.0,
    "frequency_penalty": 0.0,
    "presence_penalty": 0.0
}




# API call wrapper

def call_openai_api(api_params):
    try:
        response = client.completions.create(**api_params)
        return response
    except Exception as e:
        return f"An error occurred while calling the OpenAI API: {str(e)}"


# initialize graphdb




# Get data

def get_vectorstore_from_url(url):
    # Load the document from the URL
    loader = WebBaseLoader(url)
    document = loader.load()

    # Split the document into chunks
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=250,
        chunk_overlap=20,
        length_function=len,
        is_separator_regex=False,
    )
    document_chunks = text_splitter.split_documents(document)

    # Vectorize the document chunks
    embeddings = OpenAIEmbeddings()

    # Create the vector store from the document vectors
    vector_store = Chroma.from_documents(document_chunks, embeddings)

    return vector_store


# Talk to data

def get_context_retriever_chain(vector_store):
    llm = ChatOpenAI()

    retriever = vector_store.as_retriever()

    prompt = ChatPromptTemplate.from_messages([
        MessagesPlaceholder(variable_name="chat_history"),
        ("user", "{input}"),
        ("user", "Given the above conversation, generate a search query to look up in order to get information relevant to the conversation")
    ])
    retriever_chain = create_history_aware_retriever(llm, retriever, prompt)

    return retriever_chain



def get_conversational_rag_chain(retriever_chain):
    llm = ChatOpenAI()

    prompt = ChatPromptTemplate.from_messages([
        ("system", "Answer the user's questions based on the below context:\n\n{context}"),
        MessagesPlaceholder(variable_name="chat_history"),
        ("user", "{input}"),
    ])

    stuff_documents_chain = create_stuff_documents_chain(llm, prompt)

    return create_retrieval_chain(retriever_chain, stuff_documents_chain)

def get_response(user_input):
    retriever_chain = get_context_retriever_chain(st.session_state.vector_store)
    conversation_rag_chain = get_conversational_rag_chain(retriever_chain)

    response = conversation_rag_chain.invoke({
        "chat_history": st.session_state.chat_history,
        "input": user_input
    })

    return response

# Manage data

def summarize_content(document_content, override_params=None):
    if not document_content or document_content == "":
        return "No content provided to summarize."

    prepared_content = preprocess_summary(document_content)

    api_params = DEFAULT_API_PARAMS.copy()
    if override_params:
        api_params.update(override_params)
    messages = [
        {"role": "system", "content": "You are a helpful assistant who provides summaries."},
        {"role": "user", "content": prepared_content}
    ]
    try:
        response = client.chat.completions.create(model=api_params['model'], 
                                                  temperature=api_params['temperature'],
                                                  max_tokens=api_params['max_tokens'],
                                                  top_p=api_params['top_p'],
                                                  frequency_penalty=api_params['frequency_penalty'],
                                                  presence_penalty=api_params['presence_penalty'],
                                                  messages=messages)
        summary = response.choices[0].message.content

        return summary
    except Exception as e:
        return f"An error occurred while calling the OpenAI API: {str(e)}"

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


# test function

def process_url_and_add_to_graph(url):
    
    vector_store = get_vectorstore_from_url(url) 

    if vector_store:
        # Here, adapt the logic based on how you're implementing content summarization
        # For demonstration, assuming direct content is available for summarization
        document_content = vector_store.get_document_content()  # Placeholder; adapt based on actual implementation
        summary = summarize_content(document_content)

        # Create metadata JSON; adapt as necessary
        page_metadata = create_url_metadata_json({
            "url": url,
            "page_title": "Extracted or Placeholder Title",  # Adapt based on actual title extraction
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
    website_url = st.text_input("Website URL")
    process_button = st.sidebar.button("Process URL")

if website_url is None or website_url == "":
    st.info("Please enter a URL")

else:
    # session state
    if "chat_history" not in st.session_state:
        st.session_state.chat_history = [
            AIMessage(content="Hello, I am a bot. How can I help you?")
        ]
    if "vector_store" not in st.session_state:
        st.session_state.vector_store = get_vectorstore_from_url(website_url)


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

