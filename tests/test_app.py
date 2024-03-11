import pytest
import json
from app import create_url_metadata_json

# Choose a stable URL with content unlikely to change frequently for testing
TEST_URL = "https://xkcd.com"

def test_create_url_metadata_json_integration():
    metadata_json = create_url_metadata_json(TEST_URL)
    metadata = json.loads(metadata_json)
    
    if metadata:
        print("Metadata:")
        print(metadata)
        assert metadata["url"] == TEST_URL
        # Additional assertions can be made here based on expected structure and content of the metadata

        # Assert that necessary keys are in the metadata
        assert "url" in metadata
        assert "page_title" in metadata
        assert "summary" in metadata
        assert "date_created" in metadata
    else:
        pytest.fail("No metadata returned")