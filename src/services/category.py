import spacy
from openai import OpenAI
from datetime import datetime
from py2neo.ogm import Property, RelatedTo, GraphObject

from config import OPENAI_API_KEY
from db import Neo4jConnection
from utils.logger import get_logger
from services.keywords import Keyword, extract_keywords_from_summary
from services.document_processing import summarize_content, fetch_webpage_content
from services.openai_services import query_llm_for_categories
from services.neo4j_services import find_by_name

# Initialize logger
logger = get_logger(__name__)

# Initialize openai and spacy
client = OpenAI(api_key=OPENAI_API_KEY)
nlp = spacy.load("en_core_web_sm")


class Category(GraphObject):
    __primarykey__ = "name"

    name = Property()
    description = Property()
    keywords = RelatedTo("Keyword")
    llm_suggestions = Property()
    user_feedback = Property()
    creation_date = Property()
    last_updated = Property()

    def __init__(self, name, description=None):
        self.name = name
        self.description = description
        self.llm_suggestions = "[]"
        self.user_feedback = "[]"
        self.creation_date = datetime.utcnow().isoformat()
        self.last_updated = self.creation_date

    def add_keyword(self, keyword_name):
        """
        Adds a keyword to this category.
        """
        keyword = find_by_name(Keyword, keyword_name) or Keyword(name=keyword_name)
        self.keywords.add(keyword)
        keyword.add_to_category(self)  # Ensuring bidirectional relationship
        keyword.save()
        self.save()
        logger.info(f"Keyword '{keyword_name}' added to category '{self.name}'.")


    def save_to_neo4j(self):
        """
        Saves the category and its keywords to the Neo4j database using execute_query for efficiency.
        """
        # Prepare query and parameters for saving the category
        save_category_query = """
        MERGE (c:Category {name: $name}) 
        ON CREATE SET c.description = $description, c.creation_date = $creation_date, c.last_updated = $last_updated 
        ON MATCH SET c.description = $description, c.last_updated = datetime()
        """
        category_params = {
            "name": self.name,
            "description": self.description,
            "creation_date": self.creation_date,
            "last_updated": self.last_updated
        }
        
        # Execute query to save or update the category
        Neo4jConnection.execute_query(save_category_query, category_params)
        
        # Handle keywords
        for keyword in self.keywords:
            add_keyword_query = """
            MERGE (k:Keyword {name: $name})
            WITH k
            MATCH (c:Category {name: $category_name})
            MERGE (c)-[:HAS_KEYWORD]->(k)
            """
            keyword_params = {"name": keyword.name, "category_name": self.name}
            Neo4jConnection.execute_query(add_keyword_query, keyword_params)
        
        logger.info(f"Category '{self.name}' and its keywords successfully saved to Neo4j.")


    @staticmethod
    def find_or_create(name, description=None):
        """
        Finds an existing category by name or creates a new one if it doesn't exist.
        
        Parameters:
        - name (str): The name of the category.
        - description (str, optional): The description of the category, used if creating a new category.
        
        Returns:
        - tuple: (Category instance, was_created (bool))
        """
        category = find_by_name(Category, name)
        if category:
            return (category, False)  # Existing category found, no need to create a new one
        
        # If category does not exist, create a new one
        try:
            new_category = Category(name=name, description=description)
            new_category.creation_date = datetime.utcnow().isoformat()
            new_category.last_updated = new_category.creation_date
            
            new_category.save_to_neo4j()
            logger.info(f"New category '{name}' created and saved to Neo4j.")
            return (new_category, True)
        except Exception as e:
            logger.error(f"Failed to create and save new category '{name}': {e}", exc_info=True)
            raise




class CategoryManager:
    def __init__(self, url):
        self.url = url
        self.page_metadata = None
        self.categories = []
        self.summary = ""
        self.keywords = []


    def generate_categories(self):
        """
        Generates categories based on the webpage's content by summarizing the content,
        querying an LLM for category suggestions, and extracting relevant keywords.
        """
        self.fetch_summary()
        if self.summary:
            self.categories = query_llm_for_categories(self.summary)
            if self.categories:
                logger.info(f"Categories suggested for URL {self.url}: {self.categories}")
                self.keywords = extract_keywords_from_summary(self.summary)
                if self.keywords:
                    logger.info(f"Keywords extracted for URL {self.url}: {self.keywords}")
                else:
                    logger.warning(f"No keywords were extracted from the summary for URL: {self.url}.")
            else:
                logger.warning(f"No categories were suggested based on the summary for URL: {self.url}.")
        else:
            logger.error(f"No summary could be generated for URL: {self.url}, hence no categories or keywords will be generated.")


    def fetch_summary(self):
        """
        Uses fetch_webpage_content to fetch the main content of the webpage
        specified by self.url, and then summarizes this content.
        """
        try:
            document_content = fetch_webpage_content(self.url)
            if document_content:
                self.summary = summarize_content(document_content)
                if self.summary:
                    logger.info(f"Summary successfully generated for URL: {self.url}")
                else:
                    logger.warning(f"Failed to generate a meaningful summary for URL: {self.url}")
            else:
                logger.warning(f"No content found to fetch or summarize for URL: {self.url}")
        except Exception as e:
            logger.error(f"Error fetching or summarizing content for URL: {self.url}: {e}", exc_info=True)
            self.summary = ""


    def store_categories(self):
        if not self.categories:
            logger.info(f"No categories to store for URL: {self.url}. Process skipped.")
            return
        
        for category_name in self.categories:
            try:
                category, was_created = Category.find_or_create(name=category_name, description=self.summary)
                for keyword_name in self.keywords:
                    category.add_keyword(keyword_name)
                logger.info(f"Category '{category_name}' processed for URL: {self.url}. New category: {was_created}")
            except Exception as e:
                logger.error(f"Failed to store or update category '{category_name}' for URL: {self.url}: {e}", exc_info=True)


    def process(self):
        """
        Orchestrates the process of generating a summary, identifying categories and keywords,
        and storing them in the database.
        """
        logger.info(f"Starting category generation process for URL: {self.url}")
        try:
            self.generate_categories()
            if self.categories:
                self.store_categories()
                logger.info(f"Category generation process completed successfully for URL: {self.url}")
            else:
                logger.warning(f"No categories generated for URL: {self.url}; no further processing.")
        except Exception as e:
            logger.error(f"An unexpected error occurred during the category generation process for URL: {self.url}: {e}", exc_info=True)


def categorize_page_with_llm(url):
    """
    Creates a CategoryManager instance for the given URL and uses it to
    generate and store categories and keywords.
    """
    category_manager = CategoryManager(url)
    category_manager.process()  # This will handle summary generation, category generation, and storage.
    logger.info(f"Processing completed for URL: {url}")
