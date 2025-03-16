import asyncio
import time
import uuid
import os
import logging
import asyncio
import argparse
from typing import Dict
from neo4j import AsyncGraphDatabase

from core.utils.logger import get_logger

async def diagnose_neo4j_issues(
    uri: str = "bolt://localhost:7687",
    username: str = "neo4j",
    password: str = "password",
    timeout: int = 10,
    log_dir: str = "test_harness/logs"
):
    """
    Comprehensive Neo4j diagnostic utility to identify database performance issues.
    
    Args:
        uri: Neo4j connection URI
        username: Neo4j username
        password: Neo4j password
        timeout: Operation timeout in seconds
        log_dir: Directory for diagnostic logs
    """
    # Create logs directory if it doesn't exist
    os.makedirs(log_dir, exist_ok=True)
    
    # Set up file handler for diagnostic logs
    log_file = os.path.join(log_dir, f"neo4j_diagnostic_{time.strftime('%Y%m%d_%H%M%S')}.log")
    file_handler = logging.FileHandler(log_file)
    file_handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
    
    # Get logger and add file handler
    logger = get_logger("diagnostic.neo4j")
    logger.addHandler(file_handler)
    
    # Start diagnostic logging
    logger.info(f"Neo4j diagnostic log - {time.strftime('%Y-%m-%d %H:%M:%S')}")
    logger.info(f"Connection: {uri} (user: {username})")
    
    driver = None
    
    try:
        logger.info(f"Starting Neo4j diagnostics on {uri}")
        
        # Create driver with explicit connection timeout
        driver = AsyncGraphDatabase.driver(
            uri,
            auth=(username, password),
            connection_timeout=timeout
        )
        
        # 1. Basic connectivity check
        logger.info("Testing basic Neo4j connectivity...")
        await test_basic_connectivity(driver, logger)
        
        # 2. Check active transactions
        logger.info("Checking active transactions...")
        await check_active_transactions(driver, logger)
        
        # 3. Test isolated operations
        logger.info("Testing individual operations...")
        await test_operations(driver, logger, timeout)
        
        # 4. Check indexes
        logger.info("Checking database indexes...")
        await check_indexes(driver, logger)
        
        logger.info("Neo4j diagnostics completed successfully")
        logger.info(f"Diagnostic log saved to: {log_file}")
        
        # Also print log location to stdout
        print(f"Neo4j diagnostic log saved to: {log_file}")
        
    except Exception as e:
        logger.error(f"Diagnostic process failed: {str(e)}")
    finally:
        if driver:
            await driver.close()
            logger.debug("Neo4j driver closed")
        
        # Remove file handler to avoid affecting other loggers
        logger.removeHandler(file_handler)


async def test_basic_connectivity(driver, logger):
    """Test basic connectivity to Neo4j."""
    try:
        start = time.time()
        session = driver.session()
        result = await session.run("RETURN 1 as n")
        data = await result.data()
        duration = time.time() - start
        
        logger.info(f"✓ Basic connectivity test successful in {duration:.3f}s: {data}")
        
        # Get server version info
        result = await session.run("CALL dbms.components() YIELD name, versions RETURN name, versions")
        components = await result.data()
        for component in components:
            logger.info(f"Neo4j component: {component['name']} - {component['versions']}")
            
        await session.close()
        return True
    except Exception as e:
        logger.error(f"✗ Basic connectivity test failed: {str(e)}")
        return False


async def check_active_transactions(driver, logger):
    """Check for active transactions that might cause contention."""
    try:
        session = driver.session()
        
        # List active transactions
        result = await session.run(
            "CALL dbms.listTransactions() YIELD username, transactionId, currentQuery, status, elapsedTime"
            " RETURN username, transactionId, currentQuery, status, elapsedTime")
        transactions = await result.data()
        
        if not transactions:
            logger.info("No active transactions found")
        else:
            logger.info(f"Found {len(transactions)} active transactions:")
            for tx in transactions:
                logger.info(
                    f"Transaction {tx['transactionId']} by {tx['username']}: "
                    f"status={tx['status']}, elapsed={tx['elapsedTime']}, "
                    f"query={tx['currentQuery'][:100]}..."
                )
        
        await session.close()
        return transactions
    except Exception as e:
        logger.error(f"Failed to check active transactions: {str(e)}")
        return []


async def test_operations(driver, logger, timeout: int):
    """Test different database operations in isolation."""
    operations = [
        ("Simple count query", "MATCH (n) RETURN count(n) as count", {}),
        
        ("Create test node", 
         "CREATE (t:TestNode {id: $id, created: datetime()}) RETURN t", 
         {"id": str(uuid.uuid4())}),
        
        ("Retrieve by ID", 
         "MATCH (t:TestNode {id: $id}) RETURN t", 
         {"id": str(uuid.uuid4())}),
        
        ("Update property", 
         "MATCH (t:TestNode) SET t.updated = datetime() RETURN count(t)", 
         {}),
         
        ("Create relationship", 
         """
         MATCH (t:TestNode) 
         WITH t LIMIT 1
         CREATE (t)-[:TEST_REL {created: datetime()}]->(n:TestRelNode {id: $id})
         RETURN t, n
         """, 
         {"id": str(uuid.uuid4())}),
         
        ("Complex query with relationships", 
         """
         MATCH (t:TestNode)
         OPTIONAL MATCH (t)-[r]->(o)
         RETURN t.id, count(r) as rel_count, collect(type(r)) as rel_types
         LIMIT 10
         """, 
         {}),
         
        ("Query with property update", 
         """
         MATCH (t:Task)
         SET t.last_checked = datetime()
         RETURN t
         """, 
         {}),
         
        ("Transaction commit test", 
         """
         CREATE (t:TestTx {id: $id})
         """,
         {"id": str(uuid.uuid4())}),
         
        ("Cleanup test nodes", 
         """
         MATCH (t:TestNode) DETACH DELETE t
         """, 
         {})
    ]
    
    for name, query, params in operations:
        await test_single_operation(driver, logger, name, query, params, timeout)


async def test_single_operation(driver, logger, name: str, query: str, params: Dict, timeout: int):
    """Test a single database operation with timeout."""
    session = None
    try:
        logger.info(f"Testing operation: {name}")
        start = time.time()
        
        session = driver.session()
        
        # Start transaction
        tx = await session.begin_transaction()
        
        # Execute query with timeout
        result = await asyncio.wait_for(
            tx.run(query, params),
            timeout=timeout
        )
        
        # Fetch data
        data = await result.data()
        
        # Commit transaction
        await tx.commit()
        
        duration = time.time() - start
        logger.info(f"✓ Operation '{name}' completed in {duration:.3f}s")
        if data and len(data) > 0:
            sample = data[:min(3, len(data))]
            logger.debug(f"Sample result: {sample}")
        return True
        
    except asyncio.TimeoutError:
        logger.error(f"✗ Operation '{name}' timed out after {timeout}s")
        return False
    except Exception as e:
        logger.error(f"✗ Operation '{name}' failed: {str(e)}")
        return False
    finally:
        if session:
            await session.close()


async def check_indexes(driver, logger):
    """Check database indexes to identify potential performance issues."""
    try:
        session = driver.session()
        
        # Get schema info
        result = await session.run(
            "SHOW INDEXES")
        indexes = await result.data()
        
        logger.info(f"Found {len(indexes)} indexes in the database:")
        for idx in indexes:
            logger.info(f"Index: {idx.get('name', 'unnamed')} - {idx.get('type', 'unknown')} on {idx.get('labelsOrTypes', [])} ({idx.get('properties', [])})")
        
        # Check for missing indexes on common lookup fields
        common_entities = ["Task", "URL", "Page"]
        common_properties = ["id", "url", "task_id"]
        
        existing_indexes = set()
        for idx in indexes:
            labels = idx.get('labelsOrTypes') or []  # Use or [] to handle None
            props = idx.get('properties') or []      # Use or [] to handle None
            
            for label in labels:
                for prop in props:
                    existing_indexes.add(f"{label}.{prop}")
        
        logger.info("Checking for potentially missing indexes:")
        for entity in common_entities:
            for prop in common_properties:
                index_key = f"{entity}.{prop}"
                if index_key not in existing_indexes:
                    logger.warning(f"Potential missing index: {index_key}")
        
        await session.close()
        return indexes
    except Exception as e:
        logger.error(f"Failed to check indexes: {str(e)}")
        return []


# Create a simple runnable script
if __name__ == "__main__":
    
    parser = argparse.ArgumentParser(description='Neo4j Diagnostic Tool')
    parser.add_argument('--uri', default="bolt://localhost:7687", help='Neo4j connection URI')
    parser.add_argument('--username', default="neo4j", help='Neo4j username')
    parser.add_argument('--password', required=True, help='Neo4j password')
    parser.add_argument('--timeout', type=int, default=10, help='Operation timeout in seconds')
    parser.add_argument('--log-dir', default="test_harness/logs", help='Directory for diagnostic logs')
    
    args = parser.parse_args()
    
    print(f"Starting Neo4j diagnostics - logs will be saved to {args.log_dir}")
    asyncio.run(diagnose_neo4j_issues(
        uri=args.uri,
        username=args.username,
        password=args.password,
        timeout=args.timeout,
        log_dir=args.log_dir
    ))