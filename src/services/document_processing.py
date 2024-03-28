import spacy

from openai import OpenAI
from collections import Counter
from urllib.parse import urlparse

from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings
from langchain_community.vectorstores import Chroma
from langchain_community.document_loaders import WebBaseLoader

from services.openai_services import chat_completion
from utils.logger import get_logger
from config import OPENAI_API_KEY

# Initialize the OpenAI API with the API key from config.py
OpenAI.api_key = OPENAI_API_KEY
client = OpenAI()

# Setup logger
logger = get_logger(__name__)

# # Load the spaCy model for English
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


def extract_keywords_from_summary(summary):
    """
    Extracts keywords from a given summary using an LLM.
    
    Parameters:
    - summary (str): The content summary.
    - openai_api_key (str): The API key for accessing the LLM service.
    
    Returns:
    - list: A list of extracted keywords.
    """
    
    response = client.Completion.create(
        engine="gpt-3.5-turbo",
        prompt=f"Extract keywords from this summary, and present your response as a single string of keywords, using ', ' as a delimiter between them:\n\n{summary}",
        max_tokens=100,
        temperature=0.5
    )
    
    keywords = response.choices[0].text.strip().split(', ')
    return keywords


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
