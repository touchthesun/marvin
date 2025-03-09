// Drop existing constraints and indexes
DROP CONSTRAINT IF EXISTS page_url;
DROP CONSTRAINT IF EXISTS site_url;
DROP CONSTRAINT IF EXISTS keyword_id;
DROP INDEX IF EXISTS page_metadata;
DROP INDEX IF EXISTS keyword_normalized_text;

// Create constraints
CREATE CONSTRAINT page_url IF NOT EXISTS FOR (p:Page) REQUIRE p.url IS UNIQUE;
CREATE CONSTRAINT site_url IF NOT EXISTS FOR (s:Site) REQUIRE s.url IS UNIQUE;
CREATE CONSTRAINT keyword_id IF NOT EXISTS FOR (k:Keyword) REQUIRE k.id IS UNIQUE;

// Create indexes
CREATE INDEX page_metadata IF NOT EXISTS FOR (p:Page) ON (p.metadata_quality_score);
CREATE INDEX keyword_normalized_text IF NOT EXISTS FOR (k:Keyword) ON (k.normalized_text);

// Create schema version node
CREATE (v:SchemaVersion {version: "1.0", created_at: datetime()});