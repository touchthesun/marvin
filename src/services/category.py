import spacy
from openai import OpenAI
from datetime import datetime
from py2neo.ogm import Property, RelatedTo, GraphObject, Node
from py2neo import NodeMatcher, Graph

from config import OPENAI_API_KEY
from db import Neo4jConnection
from utils.logger import get_logger
from services.keywords import Keyword

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


def extract_keywords_from_summary(summary):
    response = client.Completion.create(
        engine="gpt-3.5-turbo",
        prompt=f"Extract keywords from this summary, and present your response as a single string of keywords, using ', ' as a delimiter between them:\n\n{summary}",
        max_tokens=100,
        temperature=0.5
    )
    
    # Extract keywords from the model's response
    raw_keywords = response.choices[0].text.strip().split(', ')

    # Validate and clean each keyword
    cleaned_keywords = [keyword.strip() for keyword in raw_keywords if is_valid_keyword(keyword)]

    return cleaned_keywords

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




def update_graph_with_content_analysis(category, summary, keywords):
    category.description = summary  # Update the description with the summary
    for keyword in keywords:
        category.add_keyword(keyword)  
    category.save_to_neo4j()  # Save the category and its keywords to Neo4j
