import requests
import json
from datetime import datetime
from newspaper import Article
from bs4 import BeautifulSoup
from utils.logger import get_logger
from services.document_processing import summarize_content


# Initialize logger
logger = get_logger(__name__)

def create_url_metadata_json(url):
    try:
        response = requests.get(url)
        if response.status_code != 200:
            logger.error(f"Failed to fetch URL {url} with status code {response.status_code}")
            return {"error": f"Failed to fetch URL with status code {response.status_code}"}

        soup = BeautifulSoup(response.content, 'html.parser')
        
        ld_json_blocks = extract_structured_data(soup)
        page_metadata = {}

        if ld_json_blocks:
            ld_json_block = ld_json_blocks[0] if len(ld_json_blocks) > 0 else {}
            page_metadata = process_ld_json_block(ld_json_block)

        # Extract additional metadata if not provided by ld+json
        if "title" not in page_metadata:
            page_metadata["title"] = extract_title(soup)
        if "author" not in page_metadata:
            page_metadata["author"] = extract_author(soup)
        if "publication_date" not in page_metadata:
            page_metadata["publication_date"] = extract_publication_date(soup)

        page_metadata["main_content"] = extract_main_content(soup)
        page_metadata["summary"] = summarize_content(page_metadata.get("main_content", ""))
        page_metadata["url"] = url
        page_metadata["date_created"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        return page_metadata
    except Exception as e:
        logger.error(f"Error processing URL {url}: {e}", exc_info=True)
        return {"error": "Failed to process URL due to an internal error."}


def process_ld_json_block(ld_json_block):
    """
    Processes a single LD+JSON block and maps its contents to the application's
    metadata format based on predefined mappings.

    Parameters:
    - ld_json_block (dict): A dictionary representation of an LD+JSON block.

    Returns:
    - dict: A dictionary containing mapped page metadata.
    """
    logger.debug("Processing LD+JSON block for metadata extraction.")

    metadata_mapping = {
        "headline": "title",
        "author": "author",
        "datePublished": "publication_date",
        "keywords": "keywords"  # Note: Keywords might need additional processing
    }
    
    page_metadata = {}

    try:
        for ld_key, meta_key in metadata_mapping.items():
            if ld_key in ld_json_block:
                if ld_key == "author" and isinstance(ld_json_block[ld_key], dict):  # Handling author as object
                    author_name = ld_json_block[ld_key].get("name", "Unknown")
                    page_metadata[meta_key] = author_name
                    logger.info(f"Author extracted: {author_name}")
                elif ld_key == "keywords" and isinstance(ld_json_block[ld_key], str):  # Handling keywords string
                    keywords_list = ld_json_block[ld_key].split(", ")
                    page_metadata[meta_key] = keywords_list
                    logger.info(f"Keywords extracted: {', '.join(keywords_list)}")
                else:
                    page_metadata[meta_key] = ld_json_block[ld_key]
                    logger.debug(f"Extracted '{meta_key}' from LD+JSON: {ld_json_block[ld_key]}")
    except Exception as e:
        logger.error(f"Error processing LD+JSON block: {e}", exc_info=True)
        page_metadata["error"] = "Partial metadata due to processing error."

    if not page_metadata:
        logger.warning("No usable metadata extracted from LD+JSON block.")
    else:
        logger.info("Successfully extracted metadata from LD+JSON block.")

    return page_metadata



def extract_title(soup):
    logger.debug("Attempting to extract the webpage title.")
    try:
        # Attempt to extract the title from the <title> tag
        if soup.title and soup.title.string:
            title = soup.title.string.strip()
            logger.info(f"Title extracted from <title> tag: {title}")
            return title
        
        # Attempt to extract title from Open Graph meta tag
        og_title = soup.find("meta", property="og:title")
        if og_title and og_title.get("content"):
            title = og_title["content"].strip()
            logger.info(f"Title extracted from Open Graph meta tag: {title}")
            return title
        
        # Attempt to extract title from Twitter meta tag
        twitter_title = soup.find("meta", property="twitter:title")
        if twitter_title and twitter_title.get("content"):
            title = twitter_title["content"].strip()
            logger.info(f"Title extracted from Twitter meta tag: {title}")
            return title
        
        # Log warning if title could not be found
        logger.warning("Unable to extract title using <title>, Open Graph, or Twitter meta tags.")
        return "Unknown Title"
    except Exception as e:
        logger.error(f"Error extracting title: {e}", exc_info=True)
        return "Unknown Title"


def extract_author(soup):
    logger.debug("Attempting to extract author information.")
    try:
        author_meta = soup.find("meta", {"name": "author"})
        if author_meta and author_meta.get("content"):
            author = author_meta["content"].strip()
            logger.info(f"Author extracted: {author}")
            return author
        else:
            # Attempt to find alternative tags or elements if the primary one fails
            alternate_sources = [
                {"property": "article:author"},
                {"property": "og:author"},
                {"name": "twitter:creator"}  # Common in articles shared on Twitter
            ]
            for source in alternate_sources:
                alt_author_meta = soup.find("meta", source)
                if alt_author_meta and alt_author_meta.get("content"):
                    author = alt_author_meta["content"].strip()
                    logger.info(f"Author extracted from alternate source: {author}")
                    return author

            logger.warning("No author information found using standard or alternate sources.")
            return "Unknown Author"
    except Exception as e:
        logger.error(f"Error extracting author information: {e}", exc_info=True)
        return "Unknown Author"


def extract_publication_date(soup):
    logger.debug("Attempting to extract publication date.")
    try:
        pub_date = soup.find("meta", {"property": "article:published_time"})
        if pub_date and pub_date["content"]:
            publication_date = pub_date["content"].strip()
            logger.info(f"Publication date extracted: {publication_date}")
            return publication_date
        else:
            # Attempt to find alternative meta tags if the primary one fails
            alternate_tags = [
                {"property": "og:published_time"},
                {"name": "date"},
                {"name": "DC.date.issued"}  # Dublin Core standard
            ]
            for tag in alternate_tags:
                alt_pub_date = soup.find("meta", tag)
                if alt_pub_date and alt_pub_date["content"]:
                    publication_date = alt_pub_date["content"].strip()
                    logger.info(f"Publication date extracted from alternate tag: {publication_date}")
                    return publication_date
            
            logger.warning("No publication date found using standard or alternate meta tags.")
            return "Unknown Date"
    except Exception as e:
        logger.error(f"Error extracting publication date: {e}", exc_info=True)
        return "Unknown Date"


def extract_main_content(url, min_content_length=100):
    logger.debug(f"Attempting to extract content from URL: {url}")
    
    try:
        # Attempt to use newspaper3k first
        article = Article(url)
        article.download()
        article.parse()
        content = article.text
        
        logger.debug(f"Content extracted using newspaper3k: {len(content)} characters")
        
        # Check if newspaper3k extracted content seems too short or missing
        if len(content) < min_content_length:
            raise ValueError(f"Content extracted appears too short (less than {min_content_length} characters), using fallback.")
            
    except Exception as fallback_reason:
        # Fallback to BeautifulSoup or another method
        logger.warning(f"Using fallback due to: {fallback_reason}")
        response = requests.get(url)
        soup = BeautifulSoup(response.content, 'html.parser')
        # Implement custom logic similar to initial BeautifulSoup attempts
        content = ' '.join(p.get_text() for p in soup.find_all('p'))
        
        logger.debug(f"Content extracted using fallback: {len(content)} characters")
        
    return content


def extract_structured_data(soup):
    logger.debug("Searching for structured data (LD+JSON) in the webpage.")
    structured_data_elements = soup.find_all('script', {'type': 'application/ld+json'})
    structured_data_list = []
    
    if structured_data_elements:
        logger.debug(f"Found {len(structured_data_elements)} LD+JSON blocks.")
    else:
        logger.debug("No LD+JSON blocks found.")

    for element in structured_data_elements:
        try:
            data = json.loads(element.get_text())
            structured_data_list.append(data)
            logger.debug("Successfully decoded LD+JSON block.")
        except json.JSONDecodeError as e:
            logger.error(f"Error decoding JSON-LD: {e}", exc_info=True)
            
    if structured_data_list:
        logger.info(f"Extracted structured data from {len(structured_data_list)} blocks.")
    else:
        logger.warning("No structured data extracted. Check if webpage contains valid LD+JSON.")
        
    return structured_data_list
