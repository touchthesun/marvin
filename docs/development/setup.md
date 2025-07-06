# Development Setup

## Prerequisites
- Python 3.11 (recommended) or Python 3.9+
- Node.js 18 or higher
- Docker (for Neo4j)
- Git

## Optional Development Tools
- [Cursor](https://cursor.sh/) - AI-powered IDE (recommended)

## Environment Setup

### 1. Clone Repository
```bash
git clone https://github.com/touchthesun/marvin.git
cd marvin
```

### 2. Python Environment Setup

**⚠️ Important:** We use Python virtual environments (venv) instead of conda for better dependency management and compatibility.

```bash
# Create virtual environment with Python 3.11 (recommended)
python3.11 -m venv marvin_venv

# Activate the virtual environment
source marvin_venv/bin/activate  # On macOS/Linux
# or
marvin_venv\Scripts\activate     # On Windows

# Upgrade pip
pip install --upgrade pip
```

### 3. Install Dependencies

**Method 1: Iterative Installation (Recommended for first-time setup)**

Due to complex dependency relationships, we recommend installing dependencies iteratively:

```bash
# 1. Install core web framework packages
pip install fastapi uvicorn pydantic pydantic-settings neo4j-driver

# 2. Install additional required packages
pip install aiohttp py2neo cryptography readability-lxml

# 3. Test the import
python -c "from api.main import app; print('Import successful')"

# 4. If you get missing module errors, install them one by one:
# pip install <missing-package-name>
# Then repeat step 3 until successful
```

**Method 2: Full Requirements Installation (May require troubleshooting)**

```bash
# Install all requirements at once (may encounter compatibility issues)
pip install -r requirements.txt
```

### 4. Node.js Setup (for extension)
```bash
cd extension
npm install
```

### 5. Neo4j Setup
The application automatically manages Neo4j via Docker when you run `python run.py`.

For manual setup:
```bash
docker run \
    --name marvin-neo4j \
    -p 7474:7474 -p 7687:7687 \
    -e NEO4J_AUTH=none \
    neo4j:5.26.5-community
```

### 6. Environment Configuration
Copy `.env.template` to `.env` and configure your settings.

## Cursor IDE Configuration

### Installing Cursor
1. Download Cursor from [cursor.sh](https://cursor.sh/)
2. Install and launch the application
3. Open the marvin project folder

### Cursor Rules
Use the .cursorrules file included with this repository. These represent implementation suggestions in line with the coding standards of this project.

```
Project Overview:
Marvin is a browser extension that helps users organize and leverage their browsing history and research materials through an active knowledge graph and LLM-powered interface.

Coding Standards:
- Use Python 3.11+ features and type hints
- Follow PEP 8 style guide with Black formatting
- Use TypeScript for extension code
- Implement test-driven development
- Document all public functions and classes
- Keep your code modular and well-organized
- Follow separation of concerns principle

Project Structure:
- core/: Backend Python code for LLM and knowledge graph
- api/: FastAPI server, routes, models
- extension/: Chrome extension code
- utils/: Development utilities
- docs/: Project documentation

Libraries and Tools:
- Neo4j for knowledge graph
- FastAPI for backend API
- JavaScript for extension UI

Testing Requirements:
- Write unit tests before implementation
- Use pytest for Python tests
- Use Jest for TypeScript tests
- Maintain 80%+ test coverage

Error Handling:
- Use proper exception handling
- Implement logging with different levels
- Validate all external inputs
 - Always use try-except blocks
 - Print informative error messages
 - Include the actual error in debug messages
```

## Verification

### 1. Backend Service
```bash
# Activate virtual environment
source marvin_venv/bin/activate

# Start the FastAPI server
python run.py

# Server should be available at http://localhost:8000
# Neo4j will be automatically started via Docker
```

### 2. Neo4j Verification
1. Access Neo4j Browser: http://localhost:7474
2. No authentication required (configured for development)
3. Run test query: `MATCH (n) RETURN n LIMIT 1`

### 3. Extension Testing
```bash
cd extension
npm run dev
```

## Troubleshooting

### Python Environment Issues

**Problem:** `ModuleNotFoundError` for various packages
**Solution:** Install missing packages iteratively:
```bash
pip install <missing-package-name>
python -c "from api.main import app; print('Import successful')"
```

**Problem:** `ValueError: mutable default for field is not allowed`
**Solution:** This is a dataclass issue. Use `default_factory` for mutable defaults:
```python
# Instead of:
field_name: List[str] = []

# Use:
field_name: List[str] = field(default_factory=list)
```

**Problem:** NumPy compilation errors with Python 3.13
**Solution:** Use Python 3.11 or 3.12 instead. Python 3.13 is too new for some packages.

### Neo4j Connection
- The application automatically manages Neo4j via Docker
- Check if Docker is running
- Verify Neo4j container: `docker ps | grep marvin-neo4j`

### Node.js Issues
- Clear npm cache if needed: `npm cache clean --force`
- Verify Node.js version: `node --version`

### Virtual Environment Issues
- Always activate the environment: `source marvin_venv/bin/activate`
- Check Python version: `python --version` (should show 3.11.x)
- If packages install to wrong location, use: `pip install --no-user <package>`

## Environment Cleanup

To avoid confusion between different Python environments:

```bash
# Remove old conda environments (if any)
conda env remove -n marvin -y

# Remove old virtual environments (if any)
rm -rf marvin_env marvin_old_venv

# Keep only the working environment
# marvin_venv/ (current working environment)
```

## Next Steps
1. Review [Development Conventions](./conventions.md)
2. Set up [Testing Environment](./testing.md)
3. Start with basic [Knowledge Graph](../architecture/components/knowledge-graph.md) implementation