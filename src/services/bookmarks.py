import json
import re
import mimetypes
from bs4 import BeautifulSoup

from utils.logger import get_logger
from services.neo4j_services import process_url_submission


logger = get_logger(__name__)

def detect_file_format(file_name):
    """
    Determine the file format by examining the MIME type of the filename.
    Returns a simplified format label ('html', 'text', 'json', 'markdown') based on the MIME type.
    """
    mime_type, _ = mimetypes.guess_type(file_name)
    
    # Define mappings from MIME types to format labels
    format_map = {
        'text/html': 'html',
        'text/plain': 'text',
        'application/json': 'json',
        'text/markdown': 'markdown'
    }
    
    # Default to 'text' if MIME type is unknown or not in the map
    return format_map.get(mime_type, 'text')

def consume_bookmarks(uploaded_file):

    # Check if the file object is valid
    if not uploaded_file:
        logger.error("No file uploaded.")
        return

    try: 
            
        # Retrieve filename from uploaded file object
        file_name = getattr(uploaded_file, 'name', 'Unknown')
        logger.info(f"Starting to process the file: {file_name}")

        # Detect file format using MIME type
        file_format = detect_file_format(file_name)
        logger.info(f"Detected file format: {file_format}")

        # Read content from the uploaded file
        file_content = uploaded_file.getvalue().decode("utf-8")
        
        # Choose the right parser based on the file format
        parsers = {
            'html': parse_html,
            'text': parse_text,
            'markdown': parse_markdown,
            'json': parse_json
        }

        bookmarks = parsers.get(file_format, lambda x: logger.error(f"No parser available for {file_format}"))(file_content)
        if bookmarks is None:
            return

        logger.info(f"Parsed {len(bookmarks)} bookmarks.")

        # Process each extracted bookmark URL
        for url, title in bookmarks:
            if not url:
                logger.error("Bookmark without URL found.")
                continue
            process_url_submission(url, title)
    
        logger.info("Finished processing all bookmarks.")
    
    except Exception as e:
        logger.error(f"An error occurred while processing the file: {e}")



def parse_html(content):
    soup = BeautifulSoup(content, 'html.parser')
    return [(bookmark.get('href'), bookmark.get_text()) for bookmark in soup.find_all('a') if bookmark.get('href')]

def parse_text(content):
    urls = content.splitlines()
    return [(url.strip(), '') for url in urls if url.strip()]

def parse_markdown(content):
    links = re.findall(r'\[(.*?)\]\((.*?)\)', content)
    return [(link[1], link[0]) for link in links]

def parse_json(content):
    data = json.loads(content)
    return [(item['url'], item.get('title', '')) for item in data.get('bookmarks', [])]
