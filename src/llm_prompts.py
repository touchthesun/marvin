prompts = {
    'category_generation': {
        'prompt': """Given a summary of web content, suggest relevant categories in a bulleted list. The categories should be broad and concise, and never more than four words in length. Categories should represent broad topics of information, and are expected to be shared across many pages. Examples include 'Agriculture', 'Artificial Intelligence', '20th Century Jazz', or 'Artificial Intelligence Research'. Categories can also include the type of page itself, examples include 'Food blog', 'web mail', 'web comic', 'research aggregator'. Categories should represent a topic or idea that is general enough to be useful in grouping many web pages.\n\nContent Summary: {}\n\nCategories (in a comma separated list):""",
        'parameters': {
            'temperature': 0.5,
            'max_tokens': 100,
            'top_p': 1.0,
            'frequency_penalty': 0.0,
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
