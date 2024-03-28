from py2neo.ogm import GraphObject, Property, RelatedFrom
from datetime import datetime
from openai import OpenAI
import spacy


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
        """Add this keyword to a category."""
        self.categories.add(category)
        self.update_last_updated()

    def remove_from_category(self, category):
        """Remove this keyword from a category."""
        if category in self.categories:
            self.categories.remove(category)
            self.update_last_updated()


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