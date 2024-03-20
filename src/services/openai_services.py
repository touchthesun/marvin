from openai import OpenAI

from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain.chains import create_history_aware_retriever, create_retrieval_chain
from langchain.chains.combine_documents import create_stuff_documents_chain

from utils.logger import get_logger
from config import OPENAI_API_KEY

# Instantiate logging
logger = get_logger(__name__)

# Initialize openai API
client = OpenAI(api_key=OPENAI_API_KEY)


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
    logger.debug(f"Sending request to OpenAI with payload: {api_params}")

    try:
        completion = client.chat.completions.create(**api_params)
        logger.debug(f"Chat completion successful. Response: {completion}")
        response = completion.choices[0].message.content
        print(response)
        return completion
        
    except Exception as e:
        logger.error(f"Chat completion failed with error: {e}")
        return {"error": str(e)}


def get_context_retriever_chain(vector_store):
    logger.debug("Initializing context retriever chain.")
    llm = client
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
    llm = client

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