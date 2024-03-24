from py2neo.ogm import GraphObject, Property, RelatedFrom
from datetime import datetime

class Keyword(GraphObject):
    __primarykey__ = "name"

    name = Property()
    creation_date = Property()
    last_updated = Property()

    # Relation to Category
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

# Additional functions related to keyword management can be added here
# For example, finding keywords by name, listing all keywords, etc.
