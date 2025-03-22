# Development Setup

## Prerequisites
- Python 3.9 or higher
- Node.js 18 or higher
- Neo4j Database (local or cloud)
- Git
- Miniconda

## Optional Development Tools
- [Cursor](https://cursor.sh/) - AI-powered IDE (recommended)

  
## Environment Setup

### 1. Clone Repository
```bash
git clone https://github.com/touchthesun/marvin.git
cd marvin
```

### 2. Python Environment
```bash
# Create conda environment
conda create -n marvin python=3.9
conda activate marvin

# Install dependencies
pip install -r requirements.txt
```

### 3. Node.js Setup (for extension)
```bash
cd extension
npm install
```

### 4. Neo4j Setup
You can choose between local or cloud Neo4j:

#### Local Neo4j (using Docker)
```bash
docker run \
    --name marvin-neo4j \
    -p 7474:7474 -p 7687:7687 \
    -e NEO4J_AUTH=neo4j/your_password \
    neo4j:latest
```

#### Cloud Neo4j
Create an account at [Neo4j Aura](https://neo4j.com/cloud/platform/aura-graph-database/) and set up a database instance.

### 5. Environment Configuration
Copy `.env.template` to `.env` and configure

## Cursor IDE Configuration

### Installing Cursor
1. Download Cursor from [cursor.sh](https://cursor.sh/)
2. Install and launch the application
3. Open the marvin project folder

### Cursor Rules
Use the .cursorrules file included with this repository. As these represent implrementation suggestions in line with the coding standards of this project, it is recommended to follow them.

```
Project Overview:
Marvin is a browser extension that helps users organize and leverage their browsing history and research materials through an active knowledge graph and LLM-powered interface.

Coding Standards:
- Use Python 3.9 features and type hints
- Follow PEP 8 style guide with Black formatting
- Use TypeScript for extension code
- Implement test-driven development
- Document all public functions and classes
- Keep your code modular and well-organized
- Follow separation of concerns principle

Project Structure:
- marvin/core: Backend Python code for LLM and knowledge graph
- marvin/api: FastAPI backend
- marvin/extension: Chrome extension code
- marvin/core/utils: Development utilities
- docs/: Project documentation

Libraries and Tools:
- Neo4j for knowledge graph
- FastAPI for backend API
- React/TypeScript for extension UI

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
# Start the FastAPI server
cd marvin
uvicorn main:app --reload

# Server should be available at http://localhost:8000
```

### 2. Neo4j Verification
1. Access Neo4j Browser:
   - Local: http://localhost:7474
   - Cloud: Use provided Aura console URL
2. Log in with configured credentials
3. Run test query: `MATCH (n) RETURN n LIMIT 1`

### 3. Extension Testing
```bash
cd extension
npm run dev
```

## Common Issues

### Neo4j Connection
- Check DB_MODE setting in .env
- Verify corresponding URI and credentials
- Test connection using Neo4j Browser

### Python Dependencies
- Ensure conda environment is activated
- Update conda if needed: `conda update -n base -c defaults conda`
- Check Python version: `python --version`

### Node.js Issues
- Clear npm cache if needed: `npm cache clean --force`
- Verify Node.js version: `node --version`

## Next Steps
1. Review [Development Conventions](./conventions.md)
2. Set up [Testing Environment](./testing.md)
3. Start with basic [Knowledge Graph](../architecture/components/knowledge-graph.md) implementation