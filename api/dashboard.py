import streamlit as st
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
import pandas as pd
from datetime import datetime
import plotly.express as px
import plotly.graph_objects as go
from typing import Dict, Any

from core.utils.logger import get_logger


# Configure logging
logger = get_logger(__name__)

class APIClient:
    def __init__(self, base_url: str, retries: int = 3):
        self.base_url = base_url
        self.session = requests.Session()
        retry = Retry(total=retries, backoff_factor=0.5)
        self.session.mount('http://', HTTPAdapter(max_retries=retry))
        self.session.mount('https://', HTTPAdapter(max_retries=retry))
    
    def _handle_response(self, response: requests.Response) -> Dict[str, Any]:
        try:
            response.raise_for_status()
            return response.json()
        except Exception as e:
            st.error(f"API Error: {str(e)}")
            return None
    
    def analyze_url(self, url: str) -> Dict[str, Any]:
        return self._handle_response(
            self.session.post(
                f"{self.base_url}/api/v1/analysis/analyze",
                json={"url": url, "context": "active_tab"}
            )
        )
    
    def get_task_status(self, task_id: str) -> Dict[str, Any]:
        return self._handle_response(
            self.session.get(f"{self.base_url}/api/v1/analysis/status/{task_id}")
        )
    
    def get_pages(self, status: str = None) -> Dict[str, Any]:
        params = {"status": status} if status else {}
        return self._handle_response(
            self.session.get(f"{self.base_url}/api/v1/pages/", params=params)
        )

    def get_graph_data(self, url: str) -> Dict[str, Any]:
        return self._handle_response(
            self.session.get(f"{self.base_url}/api/v1/graph/related/{url}")
        )
        
    # New methods for LLM interaction
    def list_llm_models(self, provider: str = "anthropic") -> Dict[str, Any]:
        """List available models for a provider"""
        return self._handle_response(
            self.session.get(f"{self.base_url}/api/v1/llm/models?provider={provider}")
        )
    
    def test_llm(self, prompt: str, model: str = "claude-3-haiku-20240307") -> Dict[str, Any]:
        """Test LLM with a simple prompt"""
        return self._handle_response(
            self.session.get(
                f"{self.base_url}/api/v1/llm/anthropic/test?prompt={prompt}&model={model}"
            )
        )
    
    def generate_streaming(self, 
                          prompt: str, 
                          system: str = None,
                          model: str = "claude-3-haiku-20240307", 
                          max_tokens: int = 1000,
                          temperature: float = 0.7) -> requests.Response:
        """Generate streaming response from LLM"""
        params = {
            "prompt": prompt,
            "model": model,
            "max_tokens": max_tokens,
            "temperature": temperature
        }
        
        if system:
            params["system"] = system
            
        # Return the raw response for streaming processing
        return self.session.get(
            f"{self.base_url}/api/v1/llm/anthropic/generate",
            params=params,
            stream=True
        )



@st.cache_data(ttl=1.0)
def get_task_status(task_id: str) -> Dict[str, Any]:
    """Get task status with caching."""
    return st.session_state.api_client.get_task_status(task_id)

def set_logging_level(level_str: str):
    """Set logging level based on string input."""
    levels = {
        "DEBUG": logger.DEBUG,
        "INFO": logger.INFO,
        "ERROR": logger.ERROR
    }
    level = levels.get(level_str, logger.INFO)
    logger.setLevel(level)
    st.session_state.logging_level = level_str
    logger.debug(f"Logging level set to {level_str}")

@st.cache_data(ttl=10.0)
def get_llm_models(provider: str):
    """Fetch available LLM models with caching."""
    return st.session_state.api_client.list_llm_models(provider)

@st.cache_data(ttl=1.0)
def fetch_queue_metrics():
    """Fetch queue metrics with caching."""
    client = st.session_state.api_client
    pending = client.get_pages("DISCOVERED")
    active = client.get_pages("IN_PROGRESS")
    
    return {
        "queue_size": len(pending["pages"]) if pending else 0,
        "active_tasks": len(active["pages"]) if active else 0,
        "max_concurrent": 5
    }


def init_session_state():
    if 'api_client' not in st.session_state:
        st.session_state.api_client = APIClient("http://localhost:8000")
    if 'tasks' not in st.session_state:
        st.session_state.tasks = {}
    if 'logging_level' not in st.session_state:
        st.session_state.logging_level = "INFO"
        set_logging_level("INFO")
    if 'messages' not in st.session_state:
        st.session_state.messages = []

def fetch_queue_metrics():
    """Fetch queue metrics with caching."""
    # Use Streamlit's caching to prevent multiple API calls
    @st.cache_data(ttl=1.0)  # Cache for 1 second
    def _fetch_metrics():
        client = st.session_state.api_client
        pending = client.get_pages("DISCOVERED")
        active = client.get_pages("IN_PROGRESS")
        
        return {
            "queue_size": len(pending["pages"]) if pending else 0,
            "active_tasks": len(active["pages"]) if active else 0,
            "max_concurrent": 5
        }
    return _fetch_metrics()

def render_task_history():
    """Render task history visualization and details."""
    if not st.session_state.tasks:
        return

    task_data = []
    for task_id, data in st.session_state.tasks.items():
        status = get_task_status(task_id)
        logger.debug(f"Task {task_id} status: {status}")
        task_data.append({
            "task_id": task_id,
            "url": data["url"],
            "submitted_at": data["submitted_at"],
            "end_time": datetime.now(),
            "status": status.get("status", "unknown")
        })
    
    if not task_data:
        return

    df = pd.DataFrame(task_data)
    
    # Timeline visualization
    fig = px.timeline(
        df,
        x_start="submitted_at",
        x_end="end_time",
        y="url",
        color="status",
        title="Task Processing Timeline"
    )
    
    fig.update_layout(
        xaxis=dict(title="Time", type="date"),
        yaxis=dict(title="URL", autorange="reversed")
    )
    
    st.plotly_chart(fig, use_container_width=True)
    
    # Detailed task table
    st.subheader("Task Details")
    display_df = df[['url', 'status', 'submitted_at']].copy()
    display_df['submitted_at'] = display_df['submitted_at'].dt.strftime('%Y-%m-%d %H:%M:%S')
    st.dataframe(
        display_df.sort_values("submitted_at", ascending=False),
        use_container_width=True
    )

def render_llm_chat():
    """Render LLM chat interface."""
    st.subheader("Chat with Claude")
    
    # Display chat messages
    for message in st.session_state.messages:
        with st.chat_message(message["role"]):
            st.markdown(message["content"])
    
    # Get available models (cached)
    models_data = get_llm_models("anthropic")
    if models_data and models_data.get("success"):
        available_models = [model.get("id") for model in models_data.get("models", [])]
    else:
        available_models = ["claude-3-haiku-20240307", "claude-3-sonnet-20240229", "claude-3-opus-20240229"]
    
    # Chat input and settings
    with st.sidebar:
        st.subheader("Chat Settings")
        selected_model = st.selectbox("Model", available_models)
        temperature = st.slider("Temperature", 0.0, 1.0, 0.7, 0.1)
        max_tokens = st.slider("Max Tokens", 100, 4000, 1000, 100)
        system_prompt = st.text_area("System Prompt (Optional)", 
                                    "You are Marvin, an intelligent assistant that helps with research.")
    
    # Input for user message
    user_input = st.chat_input("Ask Claude...")
    
    if user_input:
        # Add user message to chat history
        st.session_state.messages.append({"role": "user", "content": user_input})
        
        # Display user message
        with st.chat_message("user"):
            st.markdown(user_input)
        
        # Display assistant message with a spinner while generating
        with st.chat_message("assistant"):
            message_placeholder = st.empty()
            full_response = ""
            
            try:
                # Stream the response
                with st.spinner("Claude is thinking..."):
                    response = st.session_state.api_client.generate_streaming(
                        prompt=user_input,
                        system=system_prompt,
                        model=selected_model,
                        max_tokens=max_tokens,
                        temperature=temperature
                    )
                    
                    # Process the streaming response
                    for line in response.iter_lines():
                        if line:
                            # Parse the SSE format
                            try:
                                line_text = line.decode('utf-8')
                                if line_text.startswith("data: "):
                                    json_str = line_text[6:]  # Remove "data: " prefix
                                    data = json.loads(json_str)
                                    
                                    chunk = data.get("text", "")
                                    full_response += chunk
                                    message_placeholder.markdown(full_response + "▌")
                            except Exception as e:
                                logger.error(f"Error parsing response: {str(e)}")
                                continue
                
                # Final response without cursor
                message_placeholder.markdown(full_response)
                
                # Add to message history
                st.session_state.messages.append({"role": "assistant", "content": full_response})
                
            except Exception as e:
                message_placeholder.error(f"Error: {str(e)}")
                logger.error(f"Chat error: {str(e)}")


def main():
    st.set_page_config(page_title="Marvin Dashboard", layout="wide")
    init_session_state()
    
    # Top-level tabs
    tab1, tab2 = st.tabs(["Content Monitor", "Chat Assistant"])
    
    # Tab 1: Original content analysis dashboard
    with tab1:
        st.title("Content Analysis Monitor")
        
        # Add logging control with proper label
        col1, col2, col3, col4 = st.columns([1, 1, 1, 3])
        with col1:
            st.write("Logging Level:")
        with col2:
            level = st.selectbox(
                "Logging Level",  # Proper label
                ["DEBUG", "INFO", "ERROR"],
                index=["DEBUG", "INFO", "ERROR"].index(st.session_state.logging_level),
                key="logging_select"
            )
            if level != st.session_state.logging_level:
                set_logging_level(level)
        
        # Display metrics
        metrics = fetch_queue_metrics()
        with col3: st.metric("Queue Size", metrics["queue_size"])
        with col4: st.metric("Active Tasks", metrics["active_tasks"])
    
        # URL submission form
        with st.form("url_submission", clear_on_submit=False):
            url = st.text_input("Enter URL:")
            submitted = st.form_submit_button("Analyze")
            if submitted and url:
                logger.debug(f"Submitting URL for analysis: {url}")
                with st.spinner("Submitting URL..."):
                    result = st.session_state.api_client.analyze_url(url)
                
                if result and result.get("success"):
                    task_id = result["task_id"]
                    if 'tasks' not in st.session_state:
                        st.session_state.tasks = {}
                    st.session_state.tasks[task_id] = {
                        "url": url,
                        "submitted_at": datetime.now(),
                        "status": "enqueued"
                    }
                    st.success(f"Analysis started - Task ID: {task_id}")
                    logger.info(f"Task created: {task_id}")
                else:
                    error_msg = f"Failed to create task: {result}"
                    logger.error(error_msg)
                    st.error(error_msg)
    
        # Task history and visualization
        if hasattr(st.session_state, 'tasks') and st.session_state.tasks:
            render_task_history()
    
    # Tab 2: LLM Chat Interface
    with tab2:
        render_llm_chat()

if __name__ == "__main__":
    main()