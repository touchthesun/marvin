import json
import time
from openai import OpenAI

from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain.chains import create_history_aware_retriever, create_retrieval_chain
from langchain.chains.combine_documents import create_stuff_documents_chain
from langchain.text_splitter import RecursiveCharacterTextSplitter

from llm_prompts import prompts
from utils.tokens import num_tokens_from_messages
from utils.logger import get_logger
from config import load_config

# Instantiate and config
logger = get_logger(__name__)
config = load_config()


# TODO OpenAI returns strings, ChatOpenAI returns Messages. 
# Clean up chat completion vs summarize to use correct models

# Initialize openai API
client = OpenAI(api_key=config["openai_api_key"])
model_name = config["model_name"]


def chat_completion(messages, model=model_name, override_params=None):
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
    try:
        # Attempt to serialize the messages to JSON for logging
        json_payload = json.dumps(api_params)
        logger.debug(f"Sending request to OpenAI with JSON payload: {json_payload}")
        logger.debug(f"Final messages sent to API: {json.dumps(messages, indent=2)}")  # This assumes messages are in a format that can be directly serialized to JSON

    except TypeError as e:
        logger.error(f"Failed to serialize messages to JSON: {e}")

    try:
        completion = client.chat.completions.create(**api_params)
        logger.debug(f"Chat completion successful. Full response: {completion}")
        response = completion.choices[0].message.content
        logger.debug(f"Received response content: {response}")
        return completion
        
    except Exception as e:
        if hasattr(e, 'response'):
            error_details = e.response.json()
            logger.error(f"Chat completion failed with detailed error: {error_details}")
            return {"error": error_details}
        else:
            logger.error(f"Chat completion failed with error: {str(e)}")
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


def batch_input(input_text, max_tokens=config["max_tokens"], chunk_overlap=20):
    # Ensure both max_tokens and chunk_overlap are integers
    max_tokens = int(max_tokens)
    chunk_overlap = int(chunk_overlap)

    text_splitter = RecursiveCharacterTextSplitter.from_tiktoken_encoder(
        encoding_name="cl100k_base",
        chunk_size=max_tokens,
        chunk_overlap=chunk_overlap,
    )
    input_chunks = text_splitter.split_text(input_text)

    responses = []
    for chunk in input_chunks:
        # Prepare the chunk in message format for token counting
        message_format = [{"role": "user", "content": chunk}]
        token_count = num_tokens_from_messages(message_format)
        if token_count <= max_tokens:
            response = safe_call_openai_api(agent, chunk, max_tokens=max_tokens - token_count)
            responses.append(response)
        else:
            responses.append("Input too long to process.")
    return responses


def safe_call_openai_api(request_function, *args, **kwargs):
    max_retries = 3
    backoff_factor = 2
    for i in range(max_retries):
        try:
            response = request_function(*args, **kwargs)
            # Count tokens to ensure compliance with API usage
            token_count = num_tokens_from_messages(kwargs.get('prompt', ''))
            logger.info(f"Request made with {token_count} tokens.")
            return response
        except OpenAIError as e:
            if e.code == 429:  # Rate limit error
                sleep_time = backoff_factor ** i
                logger.error(f"Rate limit exceeded. Retrying in {sleep_time} seconds.")
                time.sleep(sleep_time)
            else:
                raise e
    raise RuntimeError("Max retries exceeded for OpenAI API call.")


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


def generate_embeddings(embeddings_model, text):
    """
    Generates embeddings for given text using the specified embeddings model.
    """
    try:
        if not text:
            logger.warning("No text provided for generating embeddings.")
            return None
        
        embeddings = embeddings_model.embed_query(text)
        logger.debug("Generated embeddings successfully.")
        return embeddings
    except Exception as e:
        logger.error(f"Failed to generate embeddings: {e}", exc_info=True)
        return None


def query_llm_for_categories(summary):
    """
    Queries the LLM to suggest categories based on the summary of webpage content.
    """
    prompt_template = prompts['category_generation']['prompt'].format(summary)
    override_params = prompts['category_generation']['parameters']

    # Construct the chat interaction for category suggestion using the revised prompt
    messages = [
        {"role": "system", "content": prompt_template},
        {"role": "user", "content": summary}
    ]
    
    response_obj = chat_completion(messages, model="gpt-4", override_params=override_params)
    
    if "error" in response_obj:
        logger.error(f"Error in obtaining categories from LLM: {response_obj['error']}")
        return []

    try:
        # Extracting the message content from the response object
        response_text = response_obj.choices[0].message.content if response_obj.choices else ""
        # Assuming the response_text could be a comma-separated list
        category_items = response_text.split(',')
        valid_categories = set()
        for item in category_items:
            category = item.strip()
            if category and len(category.split()) <= 4:
                valid_categories.add(category)
            elif isinstance(category, list):  # Check if any category is actually a list and handle accordingly
                for sub_item in category:
                    sub_category = sub_item.strip()
                    if sub_category and len(sub_category.split()) <= 4:
                        valid_categories.add(sub_category)
        logger.info(f"Valid categories extracted: {valid_categories}")
        return list(valid_categories)
    except (AttributeError, IndexError) as e:
        logger.error(f"Failed to extract categories from LLM response. Error: {e}")
        return []
