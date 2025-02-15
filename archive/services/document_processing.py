import spacy
import requests

from openai import OpenAI
from collections import Counter
from urllib.parse import urlparse
from bs4 import BeautifulSoup

from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings
from langchain_community.vectorstores import Chroma
from langchain_community.document_loaders import WebBaseLoader

from services.openai_services import chat_completion
from llm_prompts import prompts
from utils.logger import get_logger
from core.tools.config import load_config

# Initialize and config
config = load_config()
OpenAI.api_key = config["openai_api_key"]
client = OpenAI()
logger = get_logger(__name__)
nlp = spacy.load("en_core_web_sm")

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


def fetch_webpage_content(url):
    """
    Fetches and extracts main textual content from a given URL using requests and BeautifulSoup.
    
    Parameters:
    - url (str): The URL of the webpage to fetch and extract content from.
    
    Returns:
    - str: The extracted textual content from the webpage. Returns an empty string if unable to fetch or no content found.
    """
    try:
        response = requests.get(url)
        if response.status_code == 200:
            soup = BeautifulSoup(response.content, 'html.parser')
            document_content = ' '.join(p.get_text().strip() for p in soup.find_all('p'))
            if document_content:
                logger.debug(f"Content fetched successfully for URL: {url}")
                return document_content
            else:
                logger.warning(f"No content found to summarize for URL: {url}")
                return ""
        else:
            logger.error(f"Failed to fetch content for URL: {url}. HTTP Status Code: {response.status_code}")
            return ""
    except Exception as e:
        logger.error(f"Exception occurred while fetching content for URL: {url}. Error: {e}", exc_info=True)
        return ""



def extract_site_name(url):
    """
    Extracts the site name from a given URL.
    """
    try:
        site_name = urlparse(url).netloc
        if site_name:
            logger.debug(f"Extracted site name: {site_name} from URL: {url}")
        else:
            logger.warning(f"Failed to extract site name from URL: {url}")
        return site_name
    except Exception as e:
        logger.error(f"Error extracting site name from URL {url}: {e}", exc_info=True)
        return None


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


# experimental features below this line

def generate_tags_from_content(content):
    """
    Generates tags from page content using NLP for keyword extraction.
    Returns 5 most common keywords found in content.
    
    Parameters:
    content (str): Text content from which to extract keywords.

    Returns:
    list: A list of extracted keywords.
    """
    doc = nlp(content)
    # Extract nouns and proper nouns as potential tags, you can adjust this logic
    keywords = [token.text.lower() for token in doc if token.pos_ in ['NOUN', 'PROPN']]
    # Use Counter to find the most common keywords, you might adjust the number
    most_common_keywords = [item[0] for item in Counter(keywords).most_common(5)]
    return most_common_keywords
