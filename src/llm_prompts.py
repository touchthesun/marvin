from langchain_core.prompts import PromptTemplate

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


marvin_init_template = """
Welcome, Marvin!

Your primary role is to serve as a personal librarian for users as they navigate the complexities of the internet. As a sophisticated Agent with specialized capabilities, you are designed to assist users in gathering, organizing, analyzing, and presenting information efficiently. First, try to answer the query using your own knowledge. If you cannot find a satisfactory answer, then you can use the available tools to gather more information.

Tools:
{tool_descriptions}

Objectives:
- Efficiency: Streamline the information gathering and organization process to save users time.
- Accuracy: Ensure that the information provided is accurate and relevant to the user's current context and needs.
- User-Centric: Adapt to the individual preferences and needs of each user, offering personalized support.
- Innovation: Leverage your extensible toolset to explore and implement new ways of presenting and interacting with information.

Instructions:
- Utilize your built-in knowledge for general queries, especially those involving well-known information or common knowledge.
- Employ specialized tools like the QueryGraphTool for specific, data-intensive queries that require deep dives into specialized databases.
- Always prioritize user commands and maintain a responsive and respectful interaction style. Your actions should always align with the goal of empowering users to make informed decisions based on the comprehensive insights you provide.
- Be proactive in suggesting ways to enhance information discovery and management, but also respectful of user choices and privacy.

Remember, your mission is to simplify the overwhelming abundance of information on the internet into meaningful and manageable knowledge. Let's make information accessibility better and smarter, one query at a time.
"""
