"""Simple test scenario for Neo4j connectivity."""

from test_harness.scenarios.base import TestScenario

class SimpleNeo4jTestScenario(TestScenario):
    """Tests basic Neo4j connectivity and operations."""
    
    async def setup(self):
        """Set up the scenario prerequisites."""
        self.logger.info("Setting up Simple Neo4j Test scenario")
        
        # Clear existing data
        await self.components["neo4j"].clear_data()
        
        # Load basic test data
        test_data = self.config.get("fixtures", {}).get("test_data", "fixtures/test_data/basic_graph.cypher")
        await self.components["neo4j"].load_test_data(test_data)
    
    async def execute(self):
        """Execute the test scenario."""
        self.logger.info("Executing Simple Neo4j Test scenario")
        
        results = {}
        
        # Test 1: Count nodes
        count_query = "MATCH (n) RETURN count(n) as node_count"
        count_result = await self.components["neo4j"].execute_query(count_query)
        results["node_count"] = count_result[0]["node_count"] if count_result else 0
        
        # Test 2: Get all pages
        pages_query = "MATCH (p:Page) RETURN p.url as url, p.title as title"
        pages_result = await self.components["neo4j"].execute_query(pages_query)
        results["pages"] = pages_result
        
        # Test 3: Get relationships
        rels_query = """
        MATCH (p1:Page)-[r]->(p2:Page)
        RETURN p1.url as source, type(r) as relationship, p2.url as target
        """
        rels_result = await self.components["neo4j"].execute_query(rels_query)
        results["relationships"] = rels_result
        
        return results
    
    async def validate(self, results):
        """Validate the scenario results."""
        self.logger.info("Validating Simple Neo4j Test scenario results")
        
        assertions = []
        
        # Check node count
        node_count = results.get("node_count", 0)
        assertions.append(self.create_assertion(
            "node_count",
            node_count >= 4,  # At least 4 nodes (2 sites, 2 pages)
            f"Graph should contain at least 4 nodes, found {node_count}"
        ))
        
        # Check page count
        pages = results.get("pages", [])
        assertions.append(self.create_assertion(
            "page_count",
            len(pages) >= 2,  # At least 2 pages
            f"Graph should contain at least 2 pages, found {len(pages)}"
        ))
        
        # Check relationship count
        relationships = results.get("relationships", [])
        assertions.append(self.create_assertion(
            "relationship_count",
            len(relationships) >= 1,  # At least 1 relationship
            f"Graph should contain at least 1 page relationship, found {len(relationships)}"
        ))
        
        return assertions