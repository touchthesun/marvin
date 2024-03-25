from langchain.memory import EntityMemory

# Under Construction. Not used at this time.


# Initialize Entity Memory
# category_memory = EntityMemory()

# Example of adding an initial category entity with some attributes
# category_memory.add_entity("Food", {"keywords": ["recipes", "cooking", "cuisine"], "user_confirmed": True})



# def update_category_memory(suggested_categories, user_confirmed_categories):
#     """
#     Updates the category memory with LLM-suggested categories and user feedback.
    
#     Parameters:
#     suggested_categories (list): Categories suggested by the LLM.
#     user_confirmed_categories (list): Categories confirmed or adjusted by the user.
#     """
#     for category in suggested_categories:
#         # If the category is new, add it; otherwise, update existing keywords
#         if not category_memory.has_entity(category):
#             category_memory.add_entity(category, {"keywords": [], "user_confirmed": False})
        
#         # Update category with new keywords here, if applicable

#     for category in user_confirmed_categories:
#         if category_memory.has_entity(category):
#             entity = category_memory.get_entity(category)
#             entity["user_confirmed"] = True
#             category_memory.update_entity(category, entity)


# def suggest_categories_from_memory(content):
#     """
#     Suggests categories based on matching content to known category keywords in memory.
    
#     Parameters:
#     content (str): The content to categorize.
    
#     Returns:
#     list: A list of suggested categories based on memory.
#     """
#     suggested_categories = []
#     for entity in category_memory.get_all_entities():
#         keywords = entity["attributes"]["keywords"]
#         if any(keyword in content.lower() for keyword in keywords):
#             suggested_categories.append(entity["name"])
#     return suggested_categories
