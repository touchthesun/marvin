from typing import List, Dict
from langchain_community.tools.tavily_search import TavilySearchResults
from langchain.schema import Document
from config import load_config
from logger import get_logger


config = load_config()
logger = get_logger(__name__)

class WebSearch:
    def __init__(self, api_key: str, k: int = 3):
        self.api_key = api_key
        self.k = k
        self.search_client = TavilySearchResults(api_key=self.api_key)

    def search(self, query: str) -> List[Dict]:
        try:
            docs = self.search_client.run(query)
            if not all('content' in doc for doc in docs):
                logger.warning("Some documents are missing the 'content' field.")
            logger.info(f"Web Search Docs: {[str(doc)[:100] for doc in docs]}")  # Truncate log output
            return docs[:self.k]
        except Exception as e:
            logger.error(f"Error performing web search: {str(e)}")
            return []

    def search_and_format(self, query: str) -> Document:
        try:
            docs = self.search(query)
            logger.info(f"Web Search Docs: {[str(doc)[:100] for doc in docs]}")  # Truncate log output

            if not docs:
                logger.warning("No documents returned from web search.")
                return Document(page_content="No relevant information found from web search.")

            web_results = "\n".join([d.get("content", "") for d in docs if "content" in d])
            if not web_results:
                web_results = "No relevant information found from web search."
            web_results_doc = Document(page_content=web_results)
            logger.info(f"Formatted Web Results Doc: {str(web_results_doc)[:100]}")  # Truncate log output
            return web_results_doc
        except Exception as e:
            logger.error(f"Error formatting web search results: {str(e)}")
            return Document(page_content="Error: Unable to format web search results.")







