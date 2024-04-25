# tools.py
from langchain.utilities.tavily_search import TavilySearchAPIWrapper
from langchain_community.tools.tavily_search import TavilySearchResults


def initialize_tools(tool_names):
    tool_dict = {
        'tavily_search': get_tavily_search_tool,
        # Add more tools here
    }
    return [tool_dict[name]() for name in tool_names if name in tool_dict]

def get_tavily_search_tool():
    search = TavilySearchAPIWrapper()
    description = """"A search engine optimized for comprehensive, accurate, and trusted results. Useful for when you need to answer questions about current events or about recent information. Input should be a search query. If the user is asking about something that you don't know about, you should probably use this tool to see if that can provide any information."""
    tavily_tool = TavilySearchResults(api_wrapper=search, description=description)
    return tavily_tool


