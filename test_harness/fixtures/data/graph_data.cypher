// Generated test data for knowledge graph

// Create constraints
CREATE CONSTRAINT IF NOT EXISTS FOR (p:Page) REQUIRE p.url IS UNIQUE;
CREATE CONSTRAINT IF NOT EXISTS FOR (s:Site) REQUIRE s.domain IS UNIQUE;

// Create page nodes

CREATE (p0:Page {
    url: "https://stackoverflow.com/data-science/1",
    title: "Data Science Reference",
    domain: "stackoverflow.com",
    discovered_at: datetime("2025-03-07T19:52:01.458280"),
    processed_at: datetime("2025-03-07T19:52:01.458280"),
    status: "PROCESSED",
    category: "Reference"
});

CREATE (p1:Page {
    url: "https://wikipedia.org/devops/2",
    title: "Understanding DevOps",
    domain: "wikipedia.org",
    discovered_at: datetime("2025-02-24T19:52:01.458293"),
    processed_at: datetime("2025-02-24T19:52:01.458293"),
    status: "PROCESSED",
    category: "Technology"
});

CREATE (p2:Page {
    url: "https://wikipedia.org/databases/3",
    title: "Guide to Databases",
    domain: "wikipedia.org",
    discovered_at: datetime("2025-02-17T19:52:01.458299"),
    processed_at: datetime("2025-02-17T19:52:01.458299"),
    status: "PROCESSED",
    category: "Technology"
});

CREATE (p3:Page {
    url: "https://docs.python.org/api-design/4",
    title: "Understanding API Design",
    domain: "docs.python.org",
    discovered_at: datetime("2025-02-09T19:52:01.458304"),
    processed_at: datetime("2025-02-09T19:52:01.458304"),
    status: "PROCESSED",
    category: "Research"
});

CREATE (p4:Page {
    url: "https://example.com/machine-learning/5",
    title: "Machine Learning Documentation",
    domain: "example.com",
    discovered_at: datetime("2025-03-03T19:52:01.458309"),
    processed_at: datetime("2025-03-03T19:52:01.458309"),
    status: "PROCESSED",
    category: "Technology"
});

CREATE (p5:Page {
    url: "https://docs.python.org/databases/6",
    title: "Advanced Databases",
    domain: "docs.python.org",
    discovered_at: datetime("2025-02-27T19:52:01.458314"),
    processed_at: datetime("2025-02-27T19:52:01.458314"),
    status: "PROCESSED",
    category: "Research"
});

CREATE (p6:Page {
    url: "https://example.com/machine-learning/7",
    title: "Learn Machine Learning",
    domain: "example.com",
    discovered_at: datetime("2025-02-26T19:52:01.458318"),
    processed_at: datetime("2025-02-26T19:52:01.458318"),
    status: "PROCESSED",
    category: "Research"
});

CREATE (p7:Page {
    url: "https://wikipedia.org/web-development/8",
    title: "Web Development Tutorial",
    domain: "wikipedia.org",
    discovered_at: datetime("2025-02-11T19:52:01.458323"),
    processed_at: datetime("2025-02-11T19:52:01.458323"),
    status: "PROCESSED",
    category: "Research"
});

CREATE (p8:Page {
    url: "https://example.com/web-development/9",
    title: "Introduction to Web Development",
    domain: "example.com",
    discovered_at: datetime("2025-03-08T19:52:01.458327"),
    processed_at: datetime("2025-03-08T19:52:01.458327"),
    status: "PROCESSED",
    category: "Research"
});

CREATE (p9:Page {
    url: "https://test.org/software-architecture/10",
    title: "Software Architecture Documentation",
    domain: "test.org",
    discovered_at: datetime("2025-02-19T19:52:01.458331"),
    processed_at: datetime("2025-02-19T19:52:01.458331"),
    status: "PROCESSED",
    category: "Research"
});

CREATE (p10:Page {
    url: "https://test.org/testing/11",
    title: "Testing Tutorial",
    domain: "test.org",
    discovered_at: datetime("2025-02-16T19:52:01.458335"),
    processed_at: datetime("2025-02-16T19:52:01.458335"),
    status: "PROCESSED",
    category: "Technology"
});

CREATE (p11:Page {
    url: "https://example.com/machine-learning/12",
    title: "Learn Machine Learning",
    domain: "example.com",
    discovered_at: datetime("2025-02-18T19:52:01.458340"),
    processed_at: datetime("2025-02-18T19:52:01.458340"),
    status: "PROCESSED",
    category: "Technology"
});

CREATE (p12:Page {
    url: "https://stackoverflow.com/algorithms/13",
    title: "Algorithms Tutorial",
    domain: "stackoverflow.com",
    discovered_at: datetime("2025-02-11T19:52:01.458344"),
    processed_at: datetime("2025-02-11T19:52:01.458344"),
    status: "PROCESSED",
    category: "Education"
});

CREATE (p13:Page {
    url: "https://docs.python.org/devops/14",
    title: "DevOps Reference",
    domain: "docs.python.org",
    discovered_at: datetime("2025-02-14T19:52:01.458348"),
    processed_at: datetime("2025-02-14T19:52:01.458348"),
    status: "PROCESSED",
    category: "Reference"
});

CREATE (p14:Page {
    url: "https://stackoverflow.com/data-science/15",
    title: "Data Science Tutorial",
    domain: "stackoverflow.com",
    discovered_at: datetime("2025-03-01T19:52:01.458352"),
    processed_at: datetime("2025-03-01T19:52:01.458352"),
    status: "PROCESSED",
    category: "News"
});

// Create site nodes and relationships

CREATE (s_example_com:Site {
    domain: "example.com", 
    url: "https://example.com"
});

CREATE (s_test_org:Site {
    domain: "test.org", 
    url: "https://test.org"
});

CREATE (s_docs_python_org:Site {
    domain: "docs.python.org", 
    url: "https://docs.python.org"
});

CREATE (s_github_com:Site {
    domain: "github.com", 
    url: "https://github.com"
});

CREATE (s_stackoverflow_com:Site {
    domain: "stackoverflow.com", 
    url: "https://stackoverflow.com"
});

CREATE (s_wikipedia_org:Site {
    domain: "wikipedia.org", 
    url: "https://wikipedia.org"
});

// Connect pages to sites

MATCH (p:p0), (s:s_stackoverflow_com)
CREATE (p)-[:BELONGS_TO]->>(s);

MATCH (p:p1), (s:s_wikipedia_org)
CREATE (p)-[:BELONGS_TO]->>(s);

MATCH (p:p2), (s:s_wikipedia_org)
CREATE (p)-[:BELONGS_TO]->>(s);

MATCH (p:p3), (s:s_docs_python_org)
CREATE (p)-[:BELONGS_TO]->>(s);

MATCH (p:p4), (s:s_example_com)
CREATE (p)-[:BELONGS_TO]->>(s);

MATCH (p:p5), (s:s_docs_python_org)
CREATE (p)-[:BELONGS_TO]->>(s);

MATCH (p:p6), (s:s_example_com)
CREATE (p)-[:BELONGS_TO]->>(s);

MATCH (p:p7), (s:s_wikipedia_org)
CREATE (p)-[:BELONGS_TO]->>(s);

MATCH (p:p8), (s:s_example_com)
CREATE (p)-[:BELONGS_TO]->>(s);

MATCH (p:p9), (s:s_test_org)
CREATE (p)-[:BELONGS_TO]->>(s);

MATCH (p:p10), (s:s_test_org)
CREATE (p)-[:BELONGS_TO]->>(s);

MATCH (p:p11), (s:s_example_com)
CREATE (p)-[:BELONGS_TO]->>(s);

MATCH (p:p12), (s:s_stackoverflow_com)
CREATE (p)-[:BELONGS_TO]->>(s);

MATCH (p:p13), (s:s_docs_python_org)
CREATE (p)-[:BELONGS_TO]->>(s);

MATCH (p:p14), (s:s_stackoverflow_com)
CREATE (p)-[:BELONGS_TO]->>(s);

// Create relationships between pages

MATCH (a:p0), (b:p4)
CREATE (a)-[:SIMILAR_TO {strength: 0.66, created_at: datetime("2025-03-01T19:52:01.458352")}]->(b);

MATCH (a:p0), (b:p13)
CREATE (a)-[:SIMILAR_TO {strength: 0.77, created_at: datetime("2025-03-01T19:52:01.458352")}]->(b);

MATCH (a:p0), (b:p1)
CREATE (a)-[:LINKS_TO {strength: 0.72, created_at: datetime("2025-03-01T19:52:01.458352")}]->(b);

MATCH (a:p1), (b:p11)
CREATE (a)-[:LINKS_TO {strength: 0.82, created_at: datetime("2025-03-01T19:52:01.458352")}]->(b);

MATCH (a:p2), (b:p11)
CREATE (a)-[:RELATED_TO {strength: 0.74, created_at: datetime("2025-03-01T19:52:01.458352")}]->(b);

MATCH (a:p2), (b:p1)
CREATE (a)-[:LINKS_TO {strength: 0.59, created_at: datetime("2025-03-01T19:52:01.458352")}]->(b);

MATCH (a:p2), (b:p14)
CREATE (a)-[:RELATED_TO {strength: 0.53, created_at: datetime("2025-03-01T19:52:01.458352")}]->(b);

MATCH (a:p3), (b:p0)
CREATE (a)-[:SIMILAR_TO {strength: 0.66, created_at: datetime("2025-03-01T19:52:01.458352")}]->(b);

MATCH (a:p3), (b:p6)
CREATE (a)-[:LINKS_TO {strength: 0.89, created_at: datetime("2025-03-01T19:52:01.458352")}]->(b);

MATCH (a:p4), (b:p11)
CREATE (a)-[:LINKS_TO {strength: 0.52, created_at: datetime("2025-03-01T19:52:01.458352")}]->(b);

MATCH (a:p4), (b:p9)
CREATE (a)-[:LINKS_TO {strength: 0.85, created_at: datetime("2025-03-01T19:52:01.458352")}]->(b);

MATCH (a:p4), (b:p7)
CREATE (a)-[:RELATED_TO {strength: 0.63, created_at: datetime("2025-03-01T19:52:01.458352")}]->(b);

MATCH (a:p5), (b:p7)
CREATE (a)-[:RELATED_TO {strength: 0.66, created_at: datetime("2025-03-01T19:52:01.458352")}]->(b);

MATCH (a:p5), (b:p13)
CREATE (a)-[:RELATED_TO {strength: 0.74, created_at: datetime("2025-03-01T19:52:01.458352")}]->(b);

MATCH (a:p5), (b:p12)
CREATE (a)-[:RELATED_TO {strength: 0.73, created_at: datetime("2025-03-01T19:52:01.458352")}]->(b);

MATCH (a:p6), (b:p12)
CREATE (a)-[:SIMILAR_TO {strength: 0.83, created_at: datetime("2025-03-01T19:52:01.458352")}]->(b);

MATCH (a:p6), (b:p0)
CREATE (a)-[:RELATED_TO {strength: 0.87, created_at: datetime("2025-03-01T19:52:01.458352")}]->(b);

MATCH (a:p6), (b:p8)
CREATE (a)-[:RELATED_TO {strength: 0.57, created_at: datetime("2025-03-01T19:52:01.458352")}]->(b);

MATCH (a:p7), (b:p13)
CREATE (a)-[:LINKS_TO {strength: 0.87, created_at: datetime("2025-03-01T19:52:01.458352")}]->(b);

MATCH (a:p7), (b:p8)
CREATE (a)-[:RELATED_TO {strength: 0.91, created_at: datetime("2025-03-01T19:52:01.458352")}]->(b);

MATCH (a:p8), (b:p6)
CREATE (a)-[:SIMILAR_TO {strength: 0.75, created_at: datetime("2025-03-01T19:52:01.458352")}]->(b);

MATCH (a:p8), (b:p11)
CREATE (a)-[:SIMILAR_TO {strength: 0.59, created_at: datetime("2025-03-01T19:52:01.458352")}]->(b);

MATCH (a:p8), (b:p3)
CREATE (a)-[:LINKS_TO {strength: 0.59, created_at: datetime("2025-03-01T19:52:01.458352")}]->(b);

MATCH (a:p9), (b:p5)
CREATE (a)-[:LINKS_TO {strength: 0.99, created_at: datetime("2025-03-01T19:52:01.458352")}]->(b);

MATCH (a:p9), (b:p11)
CREATE (a)-[:RELATED_TO {strength: 0.51, created_at: datetime("2025-03-01T19:52:01.458352")}]->(b);

MATCH (a:p10), (b:p5)
CREATE (a)-[:LINKS_TO {strength: 0.82, created_at: datetime("2025-03-01T19:52:01.458352")}]->(b);

MATCH (a:p10), (b:p0)
CREATE (a)-[:LINKS_TO {strength: 0.69, created_at: datetime("2025-03-01T19:52:01.458352")}]->(b);

MATCH (a:p10), (b:p9)
CREATE (a)-[:SIMILAR_TO {strength: 0.61, created_at: datetime("2025-03-01T19:52:01.458352")}]->(b);

MATCH (a:p11), (b:p3)
CREATE (a)-[:SIMILAR_TO {strength: 0.67, created_at: datetime("2025-03-01T19:52:01.458352")}]->(b);

MATCH (a:p12), (b:p14)
CREATE (a)-[:RELATED_TO {strength: 0.75, created_at: datetime("2025-03-01T19:52:01.458352")}]->(b);

MATCH (a:p13), (b:p8)
CREATE (a)-[:SIMILAR_TO {strength: 0.95, created_at: datetime("2025-03-01T19:52:01.458352")}]->(b);

MATCH (a:p13), (b:p11)
CREATE (a)-[:LINKS_TO {strength: 0.84, created_at: datetime("2025-03-01T19:52:01.458352")}]->(b);

MATCH (a:p13), (b:p5)
CREATE (a)-[:SIMILAR_TO {strength: 0.99, created_at: datetime("2025-03-01T19:52:01.458352")}]->(b);

MATCH (a:p14), (b:p4)
CREATE (a)-[:SIMILAR_TO {strength: 0.78, created_at: datetime("2025-03-01T19:52:01.458352")}]->(b);

MATCH (a:p14), (b:p12)
CREATE (a)-[:RELATED_TO {strength: 0.96, created_at: datetime("2025-03-01T19:52:01.458352")}]->(b);

MATCH (a:p14), (b:p5)
CREATE (a)-[:RELATED_TO {strength: 0.56, created_at: datetime("2025-03-01T19:52:01.458352")}]->(b);

// Add keywords to pages

MATCH (p:p0)
SET p.keywords = ["reference", "tutorial", "python"];

MATCH (p:p1)
SET p.keywords = ["programming", "learning", "reference"];

MATCH (p:p2)
SET p.keywords = ["code", "database", "cloud", "api", "learning"];

MATCH (p:p3)
SET p.keywords = ["cloud", "reference", "programming", "tutorial"];

MATCH (p:p4)
SET p.keywords = ["python", "web", "api", "ai"];

MATCH (p:p5)
SET p.keywords = ["web", "algorithm", "python"];

MATCH (p:p6)
SET p.keywords = ["database", "software", "learning", "machine learning"];

MATCH (p:p7)
SET p.keywords = ["python", "api", "ai"];

MATCH (p:p8)
SET p.keywords = ["guide", "database", "code"];

MATCH (p:p9)
SET p.keywords = ["guide", "code", "cloud", "ai", "api"];

MATCH (p:p10)
SET p.keywords = ["database", "code", "cloud"];

MATCH (p:p11)
SET p.keywords = ["guide", "tutorial", "machine learning", "code"];

MATCH (p:p12)
SET p.keywords = ["software", "cloud", "reference"];

MATCH (p:p13)
SET p.keywords = ["learning", "code", "api"];

MATCH (p:p14)
SET p.keywords = ["reference", "database", "web", "algorithm"];
