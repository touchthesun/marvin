import streamlit as st
from dotenv import load_dotenv
from langchain_community.vectorstores import Chroma
from langchain_core.messages import AIMessage, HumanMessage
from langchain_community.document_loaders import WebBaseLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain.chains import create_history_aware_retriever, create_retrieval_chain
from langchain.chains.combine_documents import create_stuff_documents_chain


load_dotenv()


def get_vectorstore_from_url(url):
    # get the text in the documents
    loader = WebBaseLoader(url)
    document = loader.load()

    # split doc into chunks
    text_splitter = RecursiveCharacterTextSplitter()
    document_chunks = text_splitter.split_documents(document)

    # create vector store from chunks
    vector_store = Chroma.from_documents(document_chunks, OpenAIEmbeddings())
    return vector_store


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

    return response['answer']



# app config
st.set_page_config(page_title="Chat with websites")
st.title("Chat with websites")


# sidebar
with st.sidebar:
    st.header("Settings")
    website_url = st.text_input("Website URL")


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



"""
Function summarize_content(document_content):
    This function takes in the textual content of a document and uses the OpenAI API to generate a concise summary.

    Parameters:
    document_content (string): The textual content extracted from the webpage.

    Returns:
    summary (string): A summary of the document content.


    Step 1: Validate the input
    If document_content is empty or null:
        Return an error message or an empty string indicating no content to summarize

    Step 2: Prepare the content for the OpenAI API
    This might involve ensuring the content is within the API's maximum token limit
    prepared_content = preprocess_content_for_openai(document_content)

    Step 3: Define the parameters for the OpenAI API call
    This includes the model to use, the content to summarize, and any other relevant parameters
    api_params = {
        "model": "text-davinci-003", // Or the latest suitable model for summarization
        "prompt": "Summarize the following text:\n\n" + prepared_content,
        "temperature": 0.7, // Adjust based on desired creativity
        "max_tokens": 150, // Adjust based on how long you want the summary to be
        "top_p": 1.0,
        "frequency_penalty": 0.0,
        "presence_penalty": 0.0
    }

    Step 4: Call the OpenAI API to generate the summary
    summary = call_openai_api(api_params)

    Optional Step 5: Post-process the summary if necessary
    This could involve additional formatting or adjustments based on your application's needs
    final_summary = postprocess_summary(summary)

    Step 6: Return the summary
    Return final_summary

Function preprocess_content_for_openai(document_content):
    Placeholder for preprocessing logic
    Implement any necessary preprocessing here, such as shortening content or removing HTML tags
    Return processed_content

Function call_openai_api(api_params):
    Placeholder for the API call logic
    Implement the actual API call to OpenAI here using the provided parameters
    This will involve sending a HTTP request to the OpenAI API endpoint and handling the response
    response = send_http_request_to_openai(api_params)
    summary = extract_summary_from_response(response)
    Return summary
"""
