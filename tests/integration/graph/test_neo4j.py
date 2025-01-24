import pytest
from core.knowledge.graph import Neo4jConnection, GraphManager

class TestNeo4jIntegration:
    @pytest.fixture(autouse=True)
    def setup_teardown(self):
        """Setup before and cleanup after each test"""
        yield
        # Cleanup test data
        cleanup_query = """
        MATCH (n) DETACH DELETE n
        """
        Neo4jConnection.execute_query(cleanup_query)

    def test_database_connection(self):
        """Verify we can connect to and query the database"""
        result = Neo4jConnection.execute_query("RETURN 1 as n")
        assert result[0]["n"] == 1

    def test_site_page_creation(self):
        """Test creating a site with pages"""
        # Create test site
        site = GraphManager.create_site(
            url="https://example.com",
            name="Example Site",
            description="Test site"
        )
        assert site is not None

        # Create test page
        page = GraphManager.create_page(
            url="https://example.com/page1",
            title="Test Page",
            content_summary="Test content",
            site_url="https://example.com",
            metadata={"author": "Test Author"}
        )
        assert page is not None

        # Verify relationship
        query = """
        MATCH (s:Site)-[:CONTAINS]->(p:Page)
        WHERE s.url = $site_url AND p.url = $page_url
        RETURN s, p
        """
        result = Neo4jConnection.execute_query(query, {
            "site_url": "https://example.com",
            "page_url": "https://example.com/page1"
        })
        assert len(result) == 1

    def test_relationship_creation(self):
        """Test creating and querying relationships between pages"""
        # Create two pages
        page1 = GraphManager.create_page(
            url="https://example.com/page1",
            title="Page 1",
            content_summary="Content 1",
            site_url="https://example.com",
            metadata={}
        )
        page2 = GraphManager.create_page(
            url="https://example.com/page2",
            title="Page 2",
            content_summary="Content 2",
            site_url="https://example.com",
            metadata={}
        )

        # Create relationship
        rel = GraphManager.create_relationship(
            source_id=page1["id"],
            target_id=page2["id"],
            relationship_type="RELATES_TO",
            strength=0.8,
            evidence="Test evidence"
        )
        assert rel is not None

        # Query related pages
        related = GraphManager.get_related_pages("https://example.com/page1")
        assert len(related) == 1
        assert related[0]["related"]["url"] == "https://example.com/page2"
        assert related[0]["strength"] == 0.8

    def test_bulk_url_processing(self):
        """Test processing multiple URLs into the graph"""
        test_urls = [
            "https://example.com/page1",
            "https://example.com/page2",
            "https://example.com/page3"
        ]

        # This test will need to be implemented once we have
        # the URL processing functionality
        pass