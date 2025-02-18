# Page API Design Pattern Documentation

This section provides comprehensive documentation for the page-related API models, following the design pattern of request/response models.

1. Overview
The page model follows a RESTful API design pattern where requests are used to create, update, or query pages, and responses contain the resulting data. This pattern is applied consistently across all modules (analysis, graph, agent) for uniformity and clarity.

2. Page Create Request (Request Pattern)
Model Name: 
PageCreate

Purpose: To define the structure of a request to create a new page.

Class: 
PageCreate
Description: Represents data needed to create a new page, including URL, context, and optional IDs.
Fields:
url: HttpUrl: Required. The web URL of the page.
context: BrowserContext: Required. The current browser context.
tab_id: Optional[str]: Optional ID representing the tab.
window_id: Optional[str]: Optional ID representing the window.
bookmark_id: Optional[str]: Optional ID representing a bookmark.
browser_contexts: Set[BrowserContext]: Default factory set. Collection of browser contexts.
Documentation Example:

# Page Create Request

The request schema for creating a new page.

- **`url`**: The web URL of the page. (Required)
  ```json
  "https://example.com"
  ```

- **`context`**: The current context of the browser.
  ```json
  {"id": "123", "path": "/page"}
  ```

- **`tab_id`**: Optional identifier for the tab. (Optional)
  ```json
  "tab123"
  ```

- **`window_id`**: Optional identifier for the window. (Optional)
  ```json
  "window456"
  ```

- **`bookmark_id`**: Optional ID of a bookmark. (Optional)
  ```json
  "bk890"
  ```

- **`browser_contexts`**: Default factory set containing browser contexts.
  ```json
  {"context1": true, "context2": false}
  ```
3. Page Data Response (Response Pattern)
Model Name: 
PageData

Purpose: To define the structure of a response after creating, updating, or querying a page.

Class: 
PageData
Description: Represents data for a single page.
Fields:
id: UUID: Unique identifier. (Generated server-side)
url: str: The web URL of the page.
domain: str: The domain of the page.
status: PageStatus: Status of the page.
discovered_at: datetime: Timestamp when the page was discovered.
processed_at: Optional[datetime]: Timestamp when processing completed. (Optional)
updated_at: Optional[datetime]: Last update timestamp. (Optional)
title: Optional[str]: Page title. (Optional)
metadata: Dict[str, Any]: Additional metadata.
keywords: Dict[str, float]: Keywords and their relevance scores.
relationships: List[PageRelationship]: Relationships with other pages.
browser_contexts: Set[BrowserContext]: Collection of browser contexts. (Set type)
tab_id: Optional[str]: Tab ID. (Optional)
window_id: Optional[str]: Window ID. (Optional)
bookmark_id: Optional[str]: Bookmark ID. (Optional)
last_active: Optional[datetime]: Last active timestamp.
metrics: PageMetrics: Page metrics.
Documentation Example:




# Page Data Response

The data structure returned after creating a new page or fetching existing information.

- **`id`**: Unique identifier. (Server-generated)
  ```json
  "1234567890abcd"
  ```

- **`url`**: The web URL of the page.
  ```json
  "https://example.com/page"
  ```

- **`domain`**: Domain name.
  ```json
  "www.example.com"
  ```

- **`status`**: Current status of the page.
  ```json
  PageStatus活页式页面 (Active)
  ```

- **`discovered_at`**: Timestamp when discovered.
  ```json
  2023-10-05T14:37:29Z
  ```

- **`processed_at`**: Optional timestamp of processing completion. 
  ```json
  null (if not processed yet)
  ```

---

#### **4. Page Update Request**

**Model Name:** `PageUpdate`  
**Purpose:** To define the structure of a request to update an existing page.

- **Class:** `PageUpdate`
  - **Description:** Represents data needed to update an existing page.
  - **Fields:**
    - `context: BrowserContext`: Required. The current browser context.
    - `tab_id: Optional[str]`: Optional ID representing the tab. (Optional)
    - `window_id: Optional[str]`: Optional ID representing the window. (Optional)
    - `bookmark_id: Optional[str]`: Optional ID representing a bookmark. (Optional)

**Documentation Example:**

```markdown
# Page Update Request

The request schema for updating an existing page.

- **`context`**: Current browser context.
  ```json
  {"id": "123", "path": "/page"}
  ```

- **`tab_id`**: Optional identifier for the tab. (Optional)
  ```json
  "tab123"
  ```

- **`window_id`**: Optional identifier for the window. (Optional)
  ```json
  "window456"
  ```

- **`bookmark_id`**: Optional ID of a bookmark. (Optional)
  ```json
  "bk890"
  ```
```

---

#### **5. Page Relationships**

**Model Name:** `PageRelationship`  
**Purpose:** Defines relationships between pages.

- **Class:** `PageRelationship`
  - **Description:** Represents the relationship between two pages.
  - **Fields:**
    - `target_id: UUID`: ID of target page.
    - `type: str`: Type of relationship (e.g., reference, link).
    - `strength: float`: Strength or confidence score. (Optional)
    - `metadata: Dict[str, Any]`: Additional metadata.

**Documentation Example:**

```markdown
# Page Relationship

The structure defining relationships between pages.

- **`target_id`**: ID of the target page.
  ```json
  "1234567890abcd"
  ```

- **`type`**: Type of relationship. (Optional)
  ```json
  "reference"
  ```

- **`strength`**: Strength score of the relationship. (Float, optional)
  ```json
  null (if no strength data)
  ```

---

#### **6. Page Metrics**

**Model Name:** `PageMetrics`  
**Purpose:** Defines metrics for a page.

- **Class:** `PageMetrics`
  - **Description:** Represents various metrics of a page.
  - **Fields:**
    - `quality_score: float`: Quality score. (Optional)
    - `relevance_score: float`: Relevance score. (Optional)
    - `last_visited: Optional[datetime]`: Timestamp last visited.
    - `visit_count: int`: Number of visits. 
    - `processing_time: Optional[float]`: Time taken for processing. (Optional)
    - `keyword_count: int`: Number of keywords.

**Documentation Example:**

```markdown
# Page Metrics

The metrics associated with a page.

- **`quality_score`**: Quality score of the page.
  ```json
  null (if not applicable)
  ```

- **`relevance_score`**: Relevance score. 
  ```json
  0.75 (example value)
  ```