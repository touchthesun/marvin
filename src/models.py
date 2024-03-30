import spacy

from py2neo.ogm import GraphObject, Property, RelatedFrom, RelatedTo
from datetime import datetime
from openai import OpenAI

from config import OPENAI_API_KEY
from db import Neo4jConnection
from utils.logger import get_logger
from llm_prompts import prompts
from services.document_processing import summarize_content, fetch_webpage_content
from services.openai_services import query_llm_for_categories, chat_completion
from utils.neo4j_utils import find_by_name

# Initialize 
logger = get_logger(__name__)
nlp = spacy.load("en_core_web_sm")
client = OpenAI()


class Keyword(GraphObject): 
    __primarykey__ = "name"

    name = Property()
    creation_date = Property()
    last_updated = Property()
    pages = RelatedFrom("Pages", "HAS_KEYWORD")

    def __init__(self, name):
        self.name = name
        self.creation_date = datetime.utcnow().isoformat()
        self.last_updated = self.creation_date

    def update_last_updated(self):
        """Update the last_updated property to the current datetime."""
        self.last_updated = datetime.utcnow().isoformat()


def process_page_keywords(url, summary):
    """
    Extracts keywords from the page summary and associates them with the Page node in the graph.

    Parameters:
    - url (str): The URL of the page.
    - summary (str): The summary of the page content.
    """
    keywords = extract_keywords_from_summary(summary)
    if keywords:
        for keyword_text in keywords:
            keyword = find_by_name(Keyword, keyword_text) or Keyword(name=keyword_text)
            keyword.creation_date = datetime.utcnow().isoformat()  
            keyword.last_updated = datetime.utcnow().isoformat()

            add_keyword_to_page(url, keyword)
            logger.info(f"Keyword '{keyword_text}' associated with page '{url}'.")
    else:
        logger.warning(f"No keywords extracted for URL: {url}.")

def add_keyword_to_page(url, keyword):
    """
    Associates a Keyword object with a Page object in the Neo4j graph database.

    Parameters:
    - url (str): The URL of the page.
    - keyword (Keyword): The Keyword object to associate.
    """
    query = """
    MATCH (p:Page {url: $url})
    MERGE (k:Keyword {name: $keyword_name})
    ON CREATE SET k.creation_date = $creation_date, k.last_updated = $last_updated
    ON MATCH SET k.last_updated = $last_updated
    MERGE (p)-[:HAS_KEYWORD]->(k)
    """
    parameters = {
        "url": url,
        "keyword_name": keyword.name.lower(),
        "creation_date": keyword.creation_date,
        "last_updated": keyword.last_updated
    }
    Neo4jConnection.execute_query(query, parameters)
    logger.info(f"Keyword '{keyword.name}' successfully associated with Page '{url}'.")


def extract_keywords_from_summary(summary):
    prompt_template = prompts['keyword_extraction']['prompt'].format(summary)
    override_params = prompts['keyword_extraction']['parameters']

    # Construct messages for chat completion
    messages = [
        {"role": "system", "content": prompt_template},
        {"role": "user", "content": summary}
    ]

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


def store_keywords_in_db(url, keyword_texts):
    """
    Adds each keyword in the list of keyword_texts to the specified page in the Neo4j graph database.
    Assumes keyword_texts is a list of strings.
    """
    for keyword_text in keyword_texts:
        # Attempt to find an existing Keyword object by name or create one if not found
        keyword = find_by_name(Keyword, keyword_text)
 
        
        # If the keyword does not exist, create a new Keyword object
        if not keyword:
            keyword = Keyword(name=keyword_text)
            keyword.creation_date = datetime.utcnow().isoformat()  
            keyword.last_updated = datetime.utcnow().isoformat()
            # Here, you might want to set other properties of Keyword and save it if necessary
        
        # Now that we have a Keyword object, associate it with the page
        add_keyword_to_page(url, keyword)


class Category(GraphObject):
    __primarykey__ = "name"

    name = Property()
    description = Property()
    pages = RelatedTo("Page")
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


    def save_to_neo4j(self):
        """
        Saves the category to the Neo4j database using execute_query.
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


    def generate_categories(self):
        """
        Generates categories based on the webpage's content by summarizing the content
        and querying an LLM for category suggestions.
        """
        self.fetch_summary()
        if self.summary:
            self.categories = query_llm_for_categories(self.summary)
            if self.categories:
                logger.info(f"Categories suggested for URL {self.url}: {self.categories}")
            else:
                logger.warning(f"No categories were suggested based on the summary for URL: {self.url}.")
        else:
            logger.error(f"No summary could be generated for URL: {self.url}, hence no categories will be generated.")


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
                category, was_created = Category.find_or_create(name=category_name.strip(), description=self.summary)
                logger.info(f"Category '{category_name}' processed for URL: {self.url}. New category: {was_created}")
            except Exception as e:
                logger.error(f"Failed to store or update category '{category_name}' for URL: {self.url}: {e}", exc_info=True)


    def process(self):
        """
        Orchestrates the process of generating a summary, identifying categories,
        and storing them in the database. Returns the categories generated.
        """
        logger.info(f"Starting category generation process for URL: {self.url}")
        try:
            self.generate_categories()
            if self.categories:
                self.store_categories()
                logger.info(f"Category generation process completed successfully for URL: {self.url}. Categories: {self.categories}")
            else:
                logger.warning(f"No categories generated for URL: {self.url}; no further processing.")
                return []

        except Exception as e:
            logger.error(f"An unexpected error occurred during the category generation process for URL: {self.url}: {e}", exc_info=True)
            return []

        return self.categories

def categorize_page_with_llm(url):
    """
    Creates a CategoryManager instance for the given URL and uses it to
    generate and store categories.
    """
    category_manager = CategoryManager(url)
    categories = category_manager.process()
    logger.info(f"Processing completed for URL: {url}. Categories: {categories}")
    return categories
