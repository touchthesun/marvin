prompts = {
    'category_generation': {
        'prompt': """Given a summary of web content, suggest relevant categories that could broadly represent the content's topic or theme. Categories should be concise, ideally consisting of one to four words. Think of categories as umbrella terms that could encompass a wide range of web pages under a common theme. Some examples are 'Agriculture', 'Artificial Intelligence', '20th Century Jazz', and 'Machine Learning Research'. Consider also the type of page, such as 'Food Blog', 'Webcomic', 'Tech News', or 'Academic Journal'.

        Remember, the goal is to identify broad topics or domains that could help someone quickly understand the general subject matter of the content. Please provide your suggestions in a comma-separated list to ensure clarity and ease of processing.

        Content Summary: {}

        Please list relevant categories as a comma-separated list:""",
        'parameters': {
            'temperature': 0.5,
            'max_tokens': 100,
            'top_p': 1.0,
            'frequency_penalty': 0.5,
            'presence_penalty': 0.0,
        }
    },
    'keyword_extraction': {
        'prompt': """Extract key words or entities from the following content summary that best represent the main topics or themes, and list them separated by commas. Understand that the keywords are going to be used as search terms and grouping parameters for web pages. Given this use case, all strings returned as keywords must be simple and re-usable, one or two words only. The keywords should be concise, relevant, and specific to the content. For instance, a summary of a sports article might yield keywords like 'Olympics', '100m Sprint', 'World Record', 'Athlete Profiles'. Avoid overly broad or vague terms that do not add specific value to understanding the content.\n\nContent Summary: {}\n\nKeywords (comma-separated):""",
        'parameters': {
            'temperature': 0.3,
            'max_tokens': 60,
            'top_p': 1.0,
            'frequency_penalty': 0.5,
            'presence_penalty': 0.0,
        }
    },
}


