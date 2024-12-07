import os
from typing import List, Dict
from typing_extensions import TypedDict
from langgraph.graph import END, StateGraph
from langchain.schema import HumanMessage
from langchain_anthropic import ChatAnthropic
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import WebBaseLoader
from langchain_openai import OpenAIEmbeddings
from langchain_community.vectorstores import Chroma
from langchain.prompts.chat import (
    ChatPromptTemplate,
    HumanMessagePromptTemplate,
)
 
from web_search import WebSearch
from logger import get_logger
from config import load_config

# config and logging setup
config = load_config()
logger = get_logger(__name__)

# Web Search Setup
web_search = WebSearch(config["tavily_api_key"])

# LangSmith Setup
os.environ["LANGCHAIN_TRACING_V2"] = "true"
os.environ["LANGCHAIN_ENDPOINT"] = "https://api.smith.langchain.com"
os.environ["LANGCHAIN_API_KEY"] = "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"


# Instantiate LLM
llm = ChatAnthropic(model="claude-1.3", anthropic_api_key=config["anthropic_api_key"])


# Define State
class QueryRoutingState(TypedDict):
    query: str
    data_source: str


# Vector Store Setup
embedding = OpenAIEmbeddings(openai_api_key=config["openai_api_key"])

urls = [
    "https://www.anthropic.com/research/engineering-challenges-interpretability",
    "https://www.anthropic.com/research/claude-character",
    "https://www.anthropic.com/news/testing-and-mitigating-elections-related-risks",
    "https://www.anthropic.com/research/mapping-mind-language-model",
    "https://www.anthropic.com/research/probes-catch-sleeper-agents",
    "https://www.anthropic.com/research/measuring-model-persuasiveness",
    "https://www.anthropic.com/research/sleeper-agents-training-deceptive-llms-that-persist-through-safety-training"
]

docs = [WebBaseLoader(url).load() for url in urls]
docs_list = [item for sublist in docs for item in sublist]

text_splitter = RecursiveCharacterTextSplitter.from_tiktoken_encoder(
    chunk_size=250, chunk_overlap=20
)
doc_splits = text_splitter.split_documents(docs_list)

# Add docs to vectorDB
vector_store = Chroma.from_documents(
    documents=doc_splits,
    collection_name="rag-chroma",
    embedding=embedding,
)
retriever = vector_store.as_retriever()


# Feedback Loop Implementation
feedback_data = []
confidence_threshold = 0.8

# Workflow: Query Routing

def preprocess_query(query):
    # Implement query preprocessing steps (e.g., spell correction, abbreviation expansion)
    # Ensure the result is always a string
    return str(query)

def determine_dynamic_threshold(query):
    base_threshold = 0.8
    if len(query.split()) < 5:
        length_adjustment = 0.1
    else:
        length_adjustment = -0.1
    complexity_keywords = ["explain", "describe", "how", "why"]
    if any(keyword in query.lower() for keyword in complexity_keywords):
        complexity_adjustment = -0.1
    else:
        complexity_adjustment = 0.0
    dynamic_threshold = base_threshold + length_adjustment + complexity_adjustment
    return max(0.5, min(dynamic_threshold, 0.95))

def calculate_confidence(response):
    length_score = min(len(response.split()) / 50, 1)
    hedging_phrases = ["I think", "maybe", "possibly", "could be", "might be"]
    hedging_score = 1 - (sum(1 for phrase in hedging_phrases if phrase in response) / len(hedging_phrases))
    redundancy_score = 1 - (len(set(response.split())) / len(response.split()))
    confidence_score = (length_score + hedging_score + redundancy_score) / 3
    return confidence_score

def get_user_feedback(query, response):
    feedback = input(f"Was the response to the query '{query}' satisfactory? (yes/no): ").strip().lower()
    feedback_data.append({"query": query, "response": response, "feedback": feedback})
    return feedback

def adjust_routing_logic():
    global confidence_threshold
    good_feedback_count = sum(1 for feedback in feedback_data if feedback["feedback"] == "yes")
    bad_feedback_count = len(feedback_data) - good_feedback_count
    if bad_feedback_count > good_feedback_count:
        confidence_threshold *= 0.9
    elif good_feedback_count > bad_feedback_count:
        confidence_threshold *= 1.1


def route_query(query):
    try:
        preprocessed_query = preprocess_query(query)
        logger.info(f"Preprocessed Query: {preprocessed_query}")
        
        vector_results = retriever.invoke(preprocessed_query)
        logger.info(f"Vector Results: {[str(doc)[:100] for doc in vector_results]}")  # Truncate log output
        
        if vector_results:
            best_match = max(vector_results, key=lambda doc: doc.metadata.get('score', 0))
            logger.info(f"Best Match: {str(best_match)[:100]}")  # Truncate log output
        
            if best_match.metadata.get('score', 0) > determine_dynamic_threshold(preprocessed_query):
                logger.info(f"Returning from vector store: {best_match.page_content[:100]}")  # Truncate log output
                return best_match.page_content
        
        system_message = "If you are not confident about the answer, please respond with 'I don't know.'"
        messages = [HumanMessage(content=system_message), HumanMessage(content=preprocessed_query)]
        
        try:
            llm_response = llm.invoke(messages).content
            logger.info(f"LLM Response: {llm_response[:100]}")  # Truncate log output
        except Exception as e:
            logger.error(f"Error retrieving response from LLM: {str(e)}")
            return "Error: Unable to retrieve information from LLM due to server issues."
    
        llm_confidence = calculate_confidence(llm_response)
        logger.info(f"LLM Confidence: {llm_confidence}")
        
        if llm_response.lower() != "i don't know" and llm_confidence > confidence_threshold:
            logger.info(f"Returning from LLM: {llm_response[:100]}")  # Truncate log output
            return llm_response
        
        web_search_results_doc = web_search.search_and_format(preprocessed_query)
        logger.info(f"Web Search Results Doc: {str(web_search_results_doc)[:100]}")  # Truncate log output

        if web_search_results_doc is None or not web_search_results_doc.page_content.strip():
            logger.error("No valid web search results found.")
            return "No relevant information found from web search."
        
        web_search_content = web_search_results_doc.page_content.strip()
        logger.info(f"Web Search Content: {web_search_content[:100]}")  # Truncate log output
        
        if not web_search_content:
            web_search_content = "No relevant information found from web search."
        
        logger.info(f"Returning from web search: {web_search_content[:100]}")  # Truncate log output
        return web_search_content

    except KeyError as e:
        logger.error(f"KeyError encountered: {str(e)}")
        return "Error: KeyError encountered in query routing."
    except Exception as e:
        logger.error(f"Unexpected error in main logic: {str(e)}")
        return "Error: An unexpected error occurred during query routing."



def llm_data_source(state: QueryRoutingState) -> QueryRoutingState:
    logger.info("Entering llm_data_source node")
    try:
        query = state["query"]
        
        template = "Can the following query be answered using the LLM's training data alone?\n\nQuery: {query}\n\nAnswer:"
        prompt = ChatPromptTemplate.from_template(template)
        llm_response = llm(prompt.format_prompt(query=query).to_messages()).content
        
        if "yes" in llm_response.lower():
            template = "Please answer the following query using your training data:\n\nQuery: {query}\n\nAnswer:"
            prompt = ChatPromptTemplate.from_template(template)
            answer = llm(prompt.format_prompt(query=query).to_messages()).content
            logger.info("Query can be answered using LLM's training data")
            return {"query": query, "data_source": "llm", "answer": answer}
        else:
            logger.info("Query cannot be answered using LLM's training data")
            return {"query": query, "data_source": "unknown"}
    except Exception as e:
        logger.error(f"Error in llm_data_source node: {str(e)}")
        raise e

def vector_store_data_source(state: QueryRoutingState) -> QueryRoutingState:
    logger.info("Entering vector_store_data_source node")
    try:
        query = state["query"]
        prompt = f"Can the following query be answered using the information in the vector store?\n\nQuery: {query}\n\nAnswer:"
        messages = [HumanMessage(content=prompt)]
        llm_response = llm(messages).content
        
        if "yes" in llm_response.lower():
            relevant_documents = vector_store.similarity_search(query)
            logger.info("Query can be answered using vector store")
            return {"query": query, "data_source": "vectorstore", "documents": relevant_documents}
        else:
            logger.info("Query cannot be answered using vector store")
            return {"query": query, "data_source": "unknown"}
    except Exception as e:
        logger.error(f"Error in vector_store_data_source node: {str(e)}")
        raise e

def web_search_data_source(state: QueryRoutingState) -> QueryRoutingState:
    logger.info("Entering web_search_data_source node")
    try:
        query = state["query"]
        prompt = f"Can the following query be answered using a web search?\n\nQuery: {query}\n\nAnswer:"
        llm_response = llm(prompt)
        
        if "yes" in llm_response.lower():
            search_results = web_search.search_and_format(query)
            logger.info("Query can be answered using web search")
            return {"query": query, "data_source": "websearch", "documents": search_results}
        else:
            logger.info("Query cannot be answered using web search")
            return {"query": query, "data_source": "unknown"}
    except Exception as e:
        logger.error(f"Error in web_search_data_source node: {str(e)}")
        raise e



def extract_answer_from_web_search(query: str, search_results: List[Dict[str, str]]) -> str:
    try:
        prompt_template = """
        You are an intelligent assistant. Below are search results for the query: "{query}".
        Please determine if any of the results contain relevant information to answer the query. 
        If relevant information is found, extract and return the answer. If no relevant information 
        is found, respond with "No relevant information found."

        Search Results:
        {search_results}

        Answer:
        """
        
        formatted_results = "\n\n".join([f"URL: {result['url']}\nContent: {result.get('snippet', result['content'])}" for result in search_results])
        prompt = prompt_template.format(query=query, search_results=formatted_results)
        
        messages = [HumanMessage(content=prompt)]
        llm_response = llm.invoke(messages).content
        
        # Debugging: Output the LLM response
        logger.info(f"LLM Response: {llm_response}")
        
        if "No relevant information found" in llm_response:
            return "No relevant information found from web search."
        
        return llm_response.strip()
    
    except Exception as e:
        logger.error(f"Error extracting answer from web search results: {str(e)}")
        return "Error extracting answer from web search results."



def answer_query(state: QueryRoutingState) -> QueryRoutingState:
    logger.info("Entering answer_query node")
    try:
        data_source = state["data_source"]
        logger.info(f"Data Source: {data_source}")
        
        if data_source == "llm":
            logger.info("Answering query using LLM's training data")
            return {"query": state["query"], "answer": state["answer"]}
        elif data_source == "vectorstore":
            relevant_documents = state["documents"]
            template = "Given the following query and relevant documents, please provide a concise answer:\n\nQuery: {query}\n\nDocuments: {relevant_documents}\n\nAnswer:"
            prompt = ChatPromptTemplate.from_template(template)
            answer = llm(prompt.format_prompt(query=state['query'], relevant_documents=relevant_documents).to_messages()).content
            logger.info("Answering query using vector store")
            return {"query": state["query"], "answer": answer}
        elif data_source == "websearch":
            search_results = state["documents"]
            answer = extract_answer_from_web_search(state["query"], search_results)
            logger.info(f"Extracted Answer: {answer}")
            if answer == "No relevant information found from web search.":
                raise KeyError(answer)
            logger.info("Answering query using web search")
            return {"query": state["query"], "answer": answer}
        else:
            logger.info("Unable to answer query")
            return {"query": state["query"], "answer": "Unable to answer the query."}
    except Exception as e:
        logger.error(f"Error in answer_query node: {str(e)}")
        return {"query": state["query"], "answer": f"Error: {str(e)}"}




# Query Routing Workflow
query_routing_workflow = StateGraph(QueryRoutingState)

query_routing_workflow.add_node("llm_data_source", llm_data_source)
query_routing_workflow.add_node("vector_store_data_source", vector_store_data_source)
query_routing_workflow.add_node("web_search_data_source", web_search_data_source)
query_routing_workflow.add_node("answer_query", answer_query)

query_routing_workflow.set_conditional_entry_point(route_query, {
    "llm": "llm_data_source",
    "vectorstore": "vector_store_data_source",
    "websearch": "web_search_data_source"
})

query_routing_workflow.add_edge("llm_data_source", "answer_query")
query_routing_workflow.add_edge("vector_store_data_source", "answer_query")
query_routing_workflow.add_edge("web_search_data_source", "answer_query")
query_routing_workflow.add_edge("answer_query", END)

query_router = query_routing_workflow.compile()

# Main logic
try:
    query = "What is the capital of France?"
    initial_state = QueryRoutingState(query=query)
    
    for output in query_router.stream(initial_state):
        for key, value in output.items():
            logger.info(f"Node '{key}':")
            logger.info(f"Output: {value}")
        logger.info("\n---\n")
    
    feedback = get_user_feedback(query, output["answer"])
    print(f"User feedback: {feedback}")

    adjust_routing_logic()
    
except Exception as e:
    logger.error(f"Error in main logic: {str(e)}")
    raise e
