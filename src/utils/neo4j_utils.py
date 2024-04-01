from db import Neo4jConnection
from utils.logger import get_logger

logger = get_logger(__name__)

def find_by_name(graph_object_class, name):
    """
    Finds an object by its name from the Neo4j database.

    Parameters:
    - graph_object_class: The class of the object, derived from GraphObject.
    - name (str): The name of the object to find.

    Returns:
    The found object or None if not found.
    """
    driver = Neo4jConnection.get_driver()
    try:
        with driver.session() as session:
            result = session.run(f"MATCH (n:{graph_object_class.__name__} {{name: $name}}) RETURN n", name=name).single()
            if result:
                logger.info(f"{graph_object_class.__name__} '{name}' found in Neo4j.")
                # Additional logging to inspect the graph_object_class and result
                logger.info(f"Inspecting {graph_object_class.__name__}: {graph_object_class}, result: {result[0]}")
                try:
                    # Attempt to use the inflate method
                    inflated_object = graph_object_class.inflate(result[0])
                    logger.info(f"Inflated object: {inflated_object}")
                    return inflated_object
                except AttributeError as e:
                    # Log the error if inflate is not found
                    logger.error(f"'{graph_object_class.__name__}' object has no attribute 'inflate': {e}")
                    return None
            else:
                logger.info(f"{graph_object_class.__name__} '{name}' not found in Neo4j.")
                return None
    except Exception as e:
        logger.error(f"Error finding {graph_object_class.__name__} '{name}' in Neo4j: {e}", exc_info=True)
        raise