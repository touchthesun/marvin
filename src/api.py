from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from app import process_url
from services.neo4j_services import Neo4jConnection
from utils import logger

app = FastAPI()

class ProcessUrlRequest(BaseModel):
    url: str

class Bookmark(BaseModel):
    url: str
    title: str

class QueryRequest(BaseModel):
    query: str

@app.post("/process-url")
async def process_url(request: ProcessUrlRequest):
    process_url(ProcessUrlRequest)
    return {"message": "URL processed", "url": request.url}

@app.get("/bookmarks")
async def get_bookmarks():
    # Retrieve bookmarks
    return {"bookmarks": []}

@app.post("/bookmarks")
async def add_bookmark(bookmark: Bookmark):
    # Add a new bookmark
    return {"message": "Bookmark added", "bookmark": bookmark}

@app.post("/query")
async def run_query(request: QueryRequest):
    # Run the query against Neo4j
    return {"query": request.query, "result": "Query result"}


def get_bookmarks(limit=None):
    """
    Retrieves existing metadata for a given URL from the graph.
    """
    query = """
    MATCH (p :Page { url : $url }) RETURN p as page LIMIT to_integer($limit)
    """
    if not limit is None or type(limit) != int:
        logger.debug(f"Limit must be None or Integer: limit={limit}")
        

    parameters = {}
    result = Neo4jConnection.execute_query(query, parameters)
    return dict(result[0]) if result else {}
