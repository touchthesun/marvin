// Create test sites
CREATE (s1:Site {url: "https://example.com", domain: "example.com", name: "Example Site"});
CREATE (s2:Site {url: "https://test.org", domain: "test.org", name: "Test Organization"});

// Create test pages
CREATE (p1:Page {
  url: "https://example.com/test",
  domain: "example.com",
  title: "Test Page",
  status: "active",
  discovered_at: datetime("2023-01-01T12:00:00"),
  metadata_quality_score: 0.8
});

CREATE (p2:Page {
  url: "https://test.org/article",
  domain: "test.org",
  title: "Test Article",
  status: "active",
  discovered_at: datetime("2023-01-02T12:00:00"),
  metadata_quality_score: 0.7
});

// Create relationships
MATCH (s:Site {domain: "example.com"}), (p:Page {url: "https://example.com/test"})
CREATE (s)-[:CONTAINS]->(p);

MATCH (s:Site {domain: "test.org"}), (p:Page {url: "https://test.org/article"})
CREATE (s)-[:CONTAINS]->(p);

// Create a relationship between pages
MATCH (p1:Page {url: "https://example.com/test"}), (p2:Page {url: "https://test.org/article"})
CREATE (p1)-[:LINKS_TO {score: 0.8}]->(p2);