# Analysis Models

This section defines the models used in the analysis API.

---

## AnalysisCreateRequest

The request model for creating a new analysis.

- **`analysis_id: Optional[str]`**: The ID of the analysis (optional if unassigned). (Default: null)
  ```json
  null
  ```

- **`timestamp: datetime`**: Timestamp when created.
  ```json
  2023-10-05T14:37:29Z
  ```

- **`status: str`**: Current status of the analysis (e.g., "Processing", "Completed"). (Default: "Processing")
  ```json
  "Processing"
  ```

---

## AnalysisUpdateRequest

The request model for updating an existing analysis.

- **`analysis_id: Optional[str]`**: ID of the analysis to update. (Required if not null)
  ```json
  "a1234567890"
  ```

- **`timestamp: Optional[datetime]`**: Optional timestamp when updated.
  ```json
  null (optional)
  ```

---

## AnalysisReadResponse

The response model for reading an analysis.

- **`analysis_id: str`**: ID of the analysis. (Required)
  ```json
  "a1234567890"
  ```

- **`timestamp: datetime`**: Timestamp when read.
  ```json
  2023-10-05T14:37:29Z
  ```

- **`status: str`**: Status of the analysis. (Default: "Completed")
  ```json
  "Completed"
  ```

---

## AnalysisListRequest

The request model for listing analyses.

- **`size: int`**: Number of items to return per page.
  ```json
  10 (default)
  ```

- **`offset: int`**: Page offset. Defaults to 0.
  ```json
  0 (default)
  ```

---

## AnalysisDeleteRequest

The request model for deleting an analysis.

- **`analysis_id: str`**: ID of the analysis to delete. (Required)
  ```json
  "a1234567890"
  ```

B. Request Schema (Create and Update)
Purpose: Detail the structure of request bodies for creating or updating analyses.
AnalysisCreateRequest:

class AnalysisCreateRequest(BaseModel):
    analysis_id: Optional[str] = None
    timestamp: datetime
    status: str = "Processing"
    # Include other fields from AnalysisCreateRequest.py with type hints and defaults
AnalysisUpdateRequest:

class AnalysisUpdateRequest(BaseModel):
    analysis_id: str
    new_timestamp: Optional[datetime]
    new_status: Optional[str]
    # Additional fields as per the model's definition
Provide JSON Examples: Illustrate valid request formats with sample data.
C. Response Schema
Purpose: Describe the structure of response data after successful operations.
AnalysisReadResponse:

class AnalysisReadResponse(BaseModel):
    analysis_id: str
    timestamp: datetime
    status: str = "Completed"
    # Include other fields from AnalysisReadResponse.py with type hints and defaults
D. Examples
Purpose: Offer sample requests and responses in JSON format.
# Example Create Request

{
  "analysis_id": null,
  "timestamp": "2023-10-05T14:37:29Z",
  "status": "Processing"
}
# Example Read Response

{
  "analysis_id": "a1234567890",
  "timestamp": "2023-10-05T14:37:29Z",
  "status": "Completed"
}
E. Relationships
Purpose: Define relationships between analyses, such as tabs, windows, bookmarks.
AnalysisRelationshipRequest:

class AnalysisRelationshipRequest(BaseModel):
    analysis_id: str
    target_id: Optional[str] = None
    type: str  # e.g., "tab", "window"
    strength: Optional[float]
F. Validation and Metadata
Purpose: Include details about validations applied to request fields, such as minimum lengths or data types.
Validation Example:

AnalysisCreateRequest.required_fields = {
    "analysis_id": None,
    "timestamp": None  # Optional but requires type hinting
}
G. Error Handling and Success Stories
Purpose: Provide examples of successful requests with error responses, if applicable.
Sample Success Request:

{
  "analysis_id": "a1234567890",
  "timestamp": datetime.now().isoformat(),
  "status": "Processing"
}
Corresponding Response:

{
  "analysis_id": "a1234567890",
  "timestamp": datetime.now().isoformat(),
  "status": "Completed",
  "data": {
    "keyword_counts": {"math": 5, "science": 3},
    # Other data fields as per AnalysisReadResponse
  }
}
