prompts = {
    'category_generation': {
        'prompt': """Given a summary of web content, suggest relevant categories in a bulleted list. The categories should be broad enough to be useful for organizing content, but specific enough to offer meaningful distinctions. Avoid using overly broad or generic categories like 'Food' or 'Sports'; instead, focus on categories that provide insight into the content's specific themes or topics. For example, a recipe summary might yield categories like 'Desserts', 'Chocolate Recipes', or 'Quick and Easy Recipes'.\n\nContent Summary: {}\n\nCategories (in a bulleted list):""",
        'parameters': {
            'temperature': 0.5,
            'max_tokens': 100,
            'top_p': 1.0,
            'frequency_penalty': 0.0,
            'presence_penalty': 0.0,
        }
    },
    'keyword_extraction': {
        'prompt': """Extract key phrases or words from the following content summary that best represent the main topics or themes, and list them separated by commas. The keywords should be concise, relevant, and specific to the content. For instance, a summary of a sports article might yield keywords like 'Olympics', '100m Sprint', 'World Record', 'Athlete Profiles'. Avoid overly broad or vague terms that do not add specific value to understanding the content.\n\nContent Summary: {}\n\nKeywords (comma-separated):""",
        'parameters': {
            'temperature': 0.3,
            'max_tokens': 60,
            'top_p': 1.0,
            'frequency_penalty': 0.5,
            'presence_penalty': 0.0,
        }
    },
}
