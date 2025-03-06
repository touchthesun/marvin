import pytest
from unittest.mock import Mock, patch
from datetime import datetime
from core.knowledge.graph import Neo4jConnection, GraphManager

@pytest.fixture
def mock_driver():
    with patch('neo4j.GraphDatabase.driver') as mock:
        driver_instance = Mock()
        mock.return_value = driver_instance
        driver_instance.verify_connectivity = Mock()
        yield mock

@pytest.fixture
def mock_session():
    session = Mock()
    session.__enter__ = Mock(return_value=session)
    session.__exit__ = Mock(return_value=None)
    return session

@pytest.fixture
def mock_transaction():
    return Mock()

class TestNeo4jConnection:
    def test_get_driver_success(self, mock_driver):
        # Test successful driver initialization
        driver = Neo4jConnection.get_driver()
        assert driver is not None
        mock_driver.assert_called_once()

    def test_get_driver_missing_env_vars(self):
        # Test handling of missing environment variables
        with patch('core.knowledge.neo4j.NEO4J_URI', None):
            with pytest.raises(RuntimeError, match='Missing Neo4j environment variables'):
                Neo4jConnection.get_driver()

    def test_close_driver(self, mock_driver):
        # Test driver cleanup
        Neo4jConnection._driver = Mock()
        Neo4jConnection.close_driver()
        Neo4jConnection._driver.close.assert_called_once()
        assert Neo4jConnection._driver is None

    def test_execute_query(self, mock_driver, mock_session, mock_transaction):
        # Test query execution
        mock_result = [{"name": "test"}]
        mock_transaction.run.return_value = mock_result
        mock_session.write_transaction = Mock(return_value=mock_result)
        
        Neo4jConnection._driver = Mock()
        Neo4jConnection._driver.session.return_value = mock_session
        
        result = Neo4jConnection.execute_query("TEST_QUERY", {"param": "value"})
        assert result == mock_result

class TestGraphManager:
    @pytest.fixture
    def mock_execute_query(self):
        with patch('core.knowledge.neo4j.Neo4jConnection.execute_query') as mock:
            yield mock

    def test_create_site(self, mock_execute_query):
        # Test site creation
        test_site = {"url": "test.com", "name": "Test Site"}
        mock_execute_query.return_value = [{"s": test_site}]
        
        result = GraphManager.create_site(
            url="test.com",
            name="Test Site",
            description="Test Description"
        )
        
        assert result == test_site
        mock_execute_query.assert_called_once()

    def test_create_page(self, mock_execute_query):
        # Test page creation
        test_page = {
            "url": "test.com/page",
            "title": "Test Page",
            "content_summary": "Test Content"
        }
        mock_execute_query.return_value = [{"p": test_page}]
        
        result = GraphManager.create_page(
            url="test.com/page",
            title="Test Page",
            content_summary="Test Content",
            site_url="test.com",
            metadata={}
        )
        
        assert result == test_page
        mock_execute_query.assert_called_once()

    def test_create_relationship(self, mock_execute_query):
        # Test relationship creation
        test_rel = {"type": "RELATES_TO", "strength": 0.8}
        mock_execute_query.return_value = [{"r": test_rel}]
        
        result = GraphManager.create_relationship(
            source_id="1",
            target_id="2",
            relationship_type="RELATES_TO",
            strength=0.8,
            evidence="Test evidence"
        )
        
        assert result == test_rel
        mock_execute_query.assert_called_once()

    def test_get_page_by_url(self, mock_execute_query):
        # Test page retrieval
        test_page = {"url": "test.com/page", "title": "Test Page"}
        mock_execute_query.return_value = [{"p": test_page}]
        
        result = GraphManager.get_page_by_url("test.com/page")
        assert result == test_page
        mock_execute_query.assert_called_once()

    def test_get_page_by_url_not_found(self, mock_execute_query):
        # Test page not found
        mock_execute_query.return_value = []
        
        result = GraphManager.get_page_by_url("nonexistent.com")
        assert result is None
        mock_execute_query.assert_called_once()

    def test_update_page_access(self, mock_execute_query):
        # Test page access update
        GraphManager.update_page_access("test.com/page")
        mock_execute_query.assert_called_once()

    def test_get_related_pages(self, mock_execute_query):
        # Test related pages retrieval
        test_related = [
            {"related": {"url": "related1.com"}, "relationship_type": "RELATES_TO", "strength": 0.8},
            {"related": {"url": "related2.com"}, "relationship_type": "RELATES_TO", "strength": 0.6}
        ]
        mock_execute_query.return_value = test_related
        
        result = GraphManager.get_related_pages("test.com/page", limit=2)
        assert result == test_related
        mock_execute_query.assert_called_once()

    def test_error_handling(self, mock_execute_query):
        # Test error handling
        mock_execute_query.side_effect = Exception("Test error")
        
        with pytest.raises(Exception, match="Test error"):
            GraphManager.create_site("test.com", "Test Site")

    def test_search_graph(self, mock_execute_query):
        """Test graph search with various parameters"""
        # Mock search results
        test_nodes = [
            {"n": {"title": "Test Page", "url": "test.com/page1"}},
            {"n": {"title": "Another Test", "url": "test.com/page2"}}
        ]
        mock_execute_query.return_value = test_nodes

        # Test basic search
        result = GraphManager.search_graph({"title": "Test"}, node_type="Page")
        assert len(result) == 2
        assert result[0]["title"] == "Test Page"
        
        # Verify query construction
        mock_execute_query.assert_called_with(
            """
            MATCH (n:Page)
            WHERE n.title = $param_title
            RETURN n
            LIMIT $limit
            """,
            {"param_title": "Test", "limit": 10}
        )

        # Test pattern matching
        GraphManager.search_graph({"title": "Test%"})
        # Verify regex pattern in query
        last_call = mock_execute_query.call_args
        assert "=~" in last_call[0][0]  # Check query contains pattern matching

    def test_search_graph_no_results(self, mock_execute_query):
        """Test search with no results"""
        mock_execute_query.return_value = []
        
        result = GraphManager.search_graph({"title": "Nonexistent"})
        assert len(result) == 0

    def test_update_node(self, mock_execute_query):
        """Test node property updates"""
        test_node = {"n": {
            "id": "123",
            "title": "Updated Title",
            "content": "New content"
        }}
        mock_execute_query.return_value = [test_node]

        # Test successful update
        result = GraphManager.update_node("123", {
            "title": "Updated Title",
            "content": "New content"
        })
        
        assert result == test_node["n"]
        mock_execute_query.assert_called_once()
        
        # Verify SET clause construction
        call_args = mock_execute_query.call_args
        query = call_args[0][0]
        assert "SET" in query
        assert "n.title" in query
        assert "n.content" in query

    def test_update_node_not_found(self, mock_execute_query):
        """Test update of nonexistent node"""
        mock_execute_query.return_value = []
        
        result = GraphManager.update_node("999", {"title": "New Title"})
        assert result is None

    def test_update_relationship(self, mock_execute_query):
        """Test relationship property updates"""
        test_rel = {"r": {
            "strength": 0.9,
            "evidence": "New evidence"
        }}
        mock_execute_query.return_value = [test_rel]

        # Test successful update
        result = GraphManager.update_relationship(
            source_id="1",
            target_id="2",
            relationship_type="RELATES_TO",
            properties={
                "strength": 0.9,
                "evidence": "New evidence"
            }
        )
        
        assert result == test_rel["r"]
        mock_execute_query.assert_called_once()
        
        # Verify query construction
        call_args = mock_execute_query.call_args
        query = call_args[0][0]
        assert "MATCH (source)-[r:RELATES_TO]->(target)" in query
        assert "SET" in query
        assert "r.strength" in query
        assert "r.evidence" in query

    def test_update_relationship_not_found(self, mock_execute_query):
        """Test update of nonexistent relationship"""
        mock_execute_query.return_value = []
        
        result = GraphManager.update_relationship(
            source_id="999",
            target_id="888",
            relationship_type="RELATES_TO",
            properties={"strength": 0.5}
        )
        assert result is None

    def test_search_graph_error_handling(self, mock_execute_query):
        """Test error handling in search"""
        mock_execute_query.side_effect = Exception("Database error")
        
        with pytest.raises(Exception, match="Database error"):
            GraphManager.search_graph({"title": "Test"})

    def test_update_node_error_handling(self, mock_execute_query):
        """Test error handling in node update"""
        mock_execute_query.side_effect = Exception("Update failed")
        
        with pytest.raises(Exception, match="Update failed"):
            GraphManager.update_node("123", {"title": "New Title"})

    def test_update_relationship_error_handling(self, mock_execute_query):
        """Test error handling in relationship update"""
        mock_execute_query.side_effect = Exception("Update failed")
        
        with pytest.raises(Exception, match="Update failed"):
            GraphManager.update_relationship(
                "1", "2", "RELATES_TO", {"strength": 0.5}
            )