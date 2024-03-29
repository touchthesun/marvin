import spacy

from py2neo.ogm import GraphObject, Property, RelatedFrom, RelatedTo
from datetime import datetime
from openai import OpenAI

from config import OPENAI_API_KEY
from db import Neo4jConnection
from utils.logger import get_logger
from services.document_processing import summarize_content, fetch_webpage_content
from services.openai_services import query_llm_for_categories, chat_completion
from services.neo4j_services import find_by_name

# Initialize 
logger = get_logger(__name__)
nlp = spacy.load("en_core_web_sm")
client = OpenAI()


class Keyword(GraphObject):
    __primarykey__ = "name"

    name = Property()
    creation_date = Property()
    last_updated = Property()
    categories = RelatedFrom("Category", "HAS_KEYWORD")

    def __init__(self, name):
        self.name = name
        self.creation_date = datetime.utcnow().isoformat()
        self.last_updated = self.creation_date

    def update_last_updated(self):
        """Update the last_updated property to the current datetime."""
        self.last_updated = datetime.utcnow().isoformat()

    def add_to_category(self, category):
        try:
            query = """
            MATCH (c:Category {name: $category_name})
            MERGE (k:Keyword {name: $keyword_name})
            MERGE (k)-[:HAS_KEYWORD]->(c)
            """
            parameters = {"category_name": category.name, "keyword_name": self.name}
            Neo4jConnection.execute_query(query, parameters)
            logger.info(f"Keyword '{self.name}' successfully added to Category '{category.name}'.")
        except Exception as e:
            logger.error(f"Failed to add Keyword '{self.name}' to Category '{category.name}': {e}", exc_info=True)
            raise

    def remove_from_category(self, category):
        """Remove this keyword from a category."""
        if category in self.categories:
            self.categories.remove(category)
            self.update_last_updated()


def extract_keywords_from_summary(summary):
    # Construct messages for chat completion
    messages = [
        {"role": "system", "content": "You are a helpful assistant that extracts keywords from summaries."},
        {"role": "user", "content": f"Extract keywords from this summary:\n\n{summary}"}
    ]
    
    # Define override parameters for the chat completion request if needed
    override_params = {
        "temperature": 0.5,
        "max_tokens": 250,
    }
    
    # Use chat_completion function to get response from OpenAI
    response_obj = chat_completion(messages, model="gpt-3.5-turbo", override_params=override_params)
    
    if "error" in response_obj:
        logger.error(f"Error in obtaining keywords from LLM: {response_obj['error']}")
        return []

    try:
        # Extracting the message content from the response object
        response_text = response_obj.choices[0].message.content if response_obj.choices else ""
        raw_keywords = response_text.split(', ')  # Split the response text to get individual keywords
        cleaned_keywords = [keyword.strip() for keyword in raw_keywords if is_valid_keyword(keyword)]
        logger.debug(f"Keywords extracted: {cleaned_keywords}")
        return cleaned_keywords
    except (AttributeError, IndexError) as e:
        logger.error(f"Failed to extract keywords from response. Error: {e}")
        return []



def is_valid_keyword(keyword):
    """
    Validates a keyword using basic checks, NLP techniques, including Named Entity Recognition, 
    and domain-specific rules.
    
    Parameters:
    - keyword (str): The keyword to validate.
    
    Returns:
    - bool: True if the keyword is valid, False otherwise.
    """
    # Basic length check and stop words exclusion
    stop_words = set(["and", "or", "the", "an", "a", "with", "to", "of"])

    if len(keyword) <= 2 or keyword.lower() in stop_words:
        return False
    
    # NLP processing for part-of-speech tagging and NER
    doc = nlp(keyword)
    
    # Initially assume keyword is not valid
    valid_keyword = False
    
    for token in doc:
        # Part-of-Speech tagging to prefer nouns, proper nouns, and adjectives
        if token.pos_ in ["NOUN", "PROPN", "ADJ"]:
            valid_keyword = True

    # Check if the keyword is a named entity, enhancing its validity
    if len(doc.ents) > 0:
        valid_keyword = True
    
    for ent in doc.ents:
        if ent.label_ in ["PERSON", "ORG", "GPE"]:  # Example entity types
            valid_keyword = True
            break  # Break after finding the first significant entity
    
    return valid_keyword


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
        try:
            # Ensure the keyword exists or create a new one
            keyword_query = """
            MERGE (k:Keyword {name: $keyword_name})
            ON CREATE SET k.creation_date = datetime(), k.last_updated = datetime()
            ON MATCH SET k.last_updated = datetime()
            RETURN k
            """
            Neo4jConnection.execute_query(keyword_query, {"keyword_name": keyword_name})
            
            # Create the relationship between the keyword and the category
            relation_query = """
            MATCH (k:Keyword {name: $keyword_name}), (c:Category {name: $category_name})
            MERGE (k)-[:HAS_KEYWORD]->(c)
            """
            parameters = {"keyword_name": keyword_name, "category_name": self.name}
            Neo4jConnection.execute_query(relation_query, parameters)
            
            logger.info(f"Keyword '{keyword_name}' added to category '{self.name}'.")
        except Exception as e:
            logger.error(f"Failed to add Keyword '{keyword_name}' to Category '{self.name}': {e}", exc_info=True)
            raise


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
