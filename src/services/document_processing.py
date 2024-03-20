import requests
from datetime import datetime
from config import OPENAI_API_KEY
from openai import OpenAI
from bs4 import BeautifulSoup

from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings
from langchain_community.vectorstores import Chroma
from langchain_community.document_loaders import WebBaseLoader

from services.openai_services import chat_completion
from utils.logger import get_logger

# Initialize the OpenAI API with the API key from config.py
OpenAI.api_key = OPENAI_API_KEY
client = OpenAI()

# Setup logger
logger = get_logger(__name__)


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



def summarize_content(document_content, model="gpt-3.5-turbo", override_params=None):
    """
    Summarizes the given document content using the OpenAI chat API.
    """
    if not document_content:
        logger.warning("No content provided to summarize.")
        return "No content provided to summarize."
    
    messages = [
        {"role": "system", 
        "content": "You are a summarizing assistant, providing concise summary of provided content."},
        {"role": "user", 
        "content": document_content}
    ]

    logger.debug(f"Summarizing content with model {model}. Content: {document_content[:100]}...")  # Log first 100 characters to avoid clutter

    response = chat_completion(messages, model=model, override_params=override_params)

    if "error" in response:
        logger.error(f"Error in summarizing content: {response['error']}")
        return response["error"]
    
    try:
        summary = response.choices[0].message.content
        logger.debug(f"Content summarized successfully. Summary: {summary[:100]}...")  # Log first 100 characters
        return summary
    except (AttributeError, IndexError) as e:
        logger.error(f"Failed to extract summary from response. Error: {e}")
        return "Failed to extract summary from response."



def create_url_metadata_json(url):
    """
    Extracts page content and title from a given URL, generates a summary,
    and compiles metadata into a dictionary.

    Parameters:
    url (str): URL of the webpage to process.

    Returns:
    dict: Dictionary containing page metadata.
    """
    try:
        response = requests.get(url)
        soup = BeautifulSoup(response.content, 'html.parser')
        page_content = ' '.join(p.get_text() for p in soup.find_all('p'))
        page_title = soup.title.string if soup.title else "No Title"

        summary = summarize_content(page_content)

        page_metadata = {
            "url": url,
            "page_title": page_title,
            "summary": summary,
            "date_created": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }

        return page_metadata
    except Exception as e:
        logger.error(f"Failed to create URL metadata for {url}: {e}")
        return {}