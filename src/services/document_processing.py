import requests
from datetime import datetime
from config import OPENAI_API_KEY
from openai import OpenAI
from bs4 import BeautifulSoup
from collections import Counter
import spacy

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
    
    # Adjust this output format as necessary
    keywords = response.choices[0].text.strip().split(', ')
    return keywords


# experimental features below this line

# def extract_author(soup):
#     """
#     Attempts to extract the author of the webpage from its HTML.

#     Parameters:
#     soup (BeautifulSoup): Parsed HTML content of the webpage.

#     Returns:
#     str: The name of the author, if found.
#     """
#     # This will vary greatly depending on the site structure; this is just one example
#     author_meta = soup.find("meta", {"name": "author"})
#     return author_meta["content"] if author_meta else "Unknown"


# def categorize_content(title, content):
#     """
#     Categorizes the page content into predefined categories.

#     Parameters:
#     title (str): The title of the webpage.
#     content (str): The content of the webpage.

#     Returns:
#     str: The category of the content.
#     """
#     category_keywords = {
#         "Technology": ["technology", "software", "hardware", "programming", "coding"],
#         "Food": ["recipe", "cooking", "cuisine", "baking", "food"],
#         # Add more categories and their relevant keywords here
#     }

#     all_text = title.lower() + " " + content.lower()
#     for category, keywords in category_keywords.items():
#         if any(keyword in all_text for keyword in keywords):
#             return category
#     return "Other"  # Default category if no keywords match




# # Load the spaCy model for English
# nlp = spacy.load("en_core_web_sm")

# def generate_tags_from_content(content):
#     """
#     Generates tags from page content using NLP for keyword extraction.

#     Parameters:
#     content (str): Text content from which to extract keywords.

#     Returns:
#     list: A list of extracted keywords.
#     """
#     doc = nlp(content)
#     # Extract nouns and proper nouns as potential tags, you can adjust this logic
#     keywords = [token.text.lower() for token in doc if token.pos_ in ['NOUN', 'PROPN']]
#     # Use Counter to find the most common keywords, you might adjust the number
#     most_common_keywords = [item[0] for item in Counter(keywords).most_common(5)]
#     return most_common_keywords


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