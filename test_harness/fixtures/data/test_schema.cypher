// Uniqueness constraints
CREATE CONSTRAINT site_url IF NOT EXISTS
   FOR (s:Site) REQUIRE s.url IS UNIQUE;

CREATE CONSTRAINT page_url IF NOT EXISTS
   FOR (p:Page) REQUIRE p.url IS UNIQUE;

CREATE CONSTRAINT keyword_id IF NOT EXISTS
   FOR (k:Keyword) REQUIRE k.id IS UNIQUE;

// Performance indexes
CREATE INDEX page_metadata IF NOT EXISTS 
   FOR (p:Page) ON (p.metadata_quality_score);

CREATE INDEX keyword_normalized_text IF NOT EXISTS
   FOR (k:Keyword) ON (k.normalized_text);

CREATE INDEX keyword_type IF NOT EXISTS
   FOR (k:Keyword) ON (k.keyword_type);

// Schema version tracking
CREATE (s:SchemaVersion {
    version: "1.0",
    timestamp: datetime()
});