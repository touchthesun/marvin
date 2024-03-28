import spacy
import requests
from bs4 import BeautifulSoup
from openai import OpenAI
from datetime import datetime
from py2neo.ogm import Property, RelatedTo, GraphObject, Node
from py2neo import NodeMatcher, Graph

from config import OPENAI_API_KEY
from db import Neo4jConnection
from utils.logger import get_logger
from services.keywords import Keyword
from services.document_processing import summarize_content
from services.openai_services import query_llm_for_categories

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
        keyword = Keyword(name=keyword_name)
        self.keywords.add(keyword)

    def save_to_neo4j(self):
        driver = Neo4jConnection.get_driver()
        with driver.session() as session:
            tx = session.begin_transaction()
            try:
                tx.run("MERGE (c:Category {name: $name}) "
                       "ON CREATE SET c.description = $description, c.creation_date = datetime($creation_date), "
                       "c.last_updated = datetime($last_updated) "
                       "ON MATCH SET c.description = $description, c.last_updated = datetime()",
                       name=self.name, description=self.description,
                       creation_date=self.creation_date, last_updated=self.last_updated)
                for keyword in self.keywords:
                    tx.run("MERGE (k:Keyword {name: $name})", name=keyword.name)
                    tx.run("""
                        MATCH (c:Category {name: $category_name}), (k:Keyword {name: $keyword_name})
                        MERGE (c)-[:HAS_KEYWORD]->(k)
                        """, category_name=self.name, keyword_name=keyword.name)
                tx.commit()  # Commit transaction if all operations succeed
                logger.info(f"Category '{self.name}' and its keywords successfully saved to Neo4j.")
            except Exception as e:
                tx.rollback()  # Rollback transaction in case of an error
                logger.error(f"Failed to save category '{self.name}' to Neo4j: {e}", exc_info=True)
                raise

    @staticmethod
    def find_by_name(name):
        driver = Neo4jConnection.get_driver()
        try:
            with driver.session() as session:
                result = session.run("MATCH (c:Category {name: $name}) RETURN c", name=name).single()
                if result:
                    logger.info(f"Category '{name}' found in Neo4j.")
                    category_node = result.get("c")
                    return Category.from_node(category_node)
                else:
                    logger.info(f"Category '{name}' not found in Neo4j.")
            return None
        except Exception as e:
            logger.error(f"Error finding category '{name}' in Neo4j: {e}", exc_info=True)
            raise

    @staticmethod
    def from_node(node):
        """
        Convert a Neo4j node to a Category instance.
        
        Parameters:
        - node: The Neo4j node to convert.
        
        Returns:
        - A Category instance with properties populated from the node.
        """
        if node:
            try: 
                category = Category(node['name'], node['description'])
                # Assuming 'creation_date' and 'last_updated' are strings in ISO format
                category.creation_date = node.get('creation_date', category.creation_date)
                category.last_updated = node.get('last_updated', category.last_updated)
                logger.info(f"Node converted to Category instance: {node['name']}")
                return category
            except Exception as e:
                logger.error(f"Failed to convert node to Category instance: {e}", exc_info=True)
            raise


def add_category_to_neo4j(name, description):
    new_category = Category(name, description)
    new_category.save_to_neo4j()


def update_graph_with_content_analysis(category, summary, keywords):
    category.description = summary  # Update the description with the summary
    for keyword in keywords:
        category.add_keyword(keyword)  
    category.save_to_neo4j()  # Save the category and its keywords to Neo4j


def categorize_page_with_llm(url):
    """
    Fetches webpage content, summarizes it, and queries an LLM for category suggestions.
    """
    try:
        response = requests.get(url)
        if response.status_code == 200:
            soup = BeautifulSoup(response.content, 'html.parser')
            document_content = ' '.join(p.get_text() for p in soup.find_all('p'))
            if document_content:
                summary = summarize_content(document_content)
                categories = query_llm_for_categories(summary)
                if categories:
                    store_initial_categories_in_db(url, categories)
                    logger.info(f"Successfully categorized and updated the page: {url} with categories: {categories}")
                else:
                    logger.warning(f"No categories were suggested for the page: {url}.")
            else:
                logger.warning(f"No content found to summarize for URL: {url}")
        else:
            logger.error(f"Failed to fetch content for URL: {url}. HTTP Status Code: {response.status_code}")
    except Exception as e:
        logger.error(f"Exception occurred while fetching content for URL: {url}. Error: {e}", exc_info=True)