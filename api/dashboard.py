import streamlit as st
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
import pandas as pd
from datetime import datetime
import plotly.express as px
import plotly.graph_objects as go
from typing import Dict, Any

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
                json={"url": url, "context": "ACTIVE_TAB"}
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

def init_session_state():
    if 'api_client' not in st.session_state:
        st.session_state.api_client = APIClient("http://localhost:8000")
    if 'tasks' not in st.session_state:
        st.session_state.tasks = {}

def fetch_queue_metrics():
    client = st.session_state.api_client
    pending = client.get_pages("DISCOVERED")
    active = client.get_pages("IN_PROGRESS")
    
    return {
        "queue_size": len(pending["pages"]) if pending else 0,
        "active_tasks": len(active["pages"]) if active else 0,
        "max_concurrent": 5
    }

def main():
    st.set_page_config(page_title="Content Analysis Monitor", layout="wide")
    init_session_state()
    
    st.title("Content Analysis Monitor")
    
    # Display metrics
    metrics = fetch_queue_metrics()
    col1, col2, col3 = st.columns(3)
    with col1: st.metric("Queue Size", metrics["queue_size"])
    with col2: st.metric("Active Tasks", metrics["active_tasks"])
    with col3: st.metric("Max Concurrent", metrics["max_concurrent"])

    # URL submission form
    with st.form("url_submission"):
        url = st.text_input("Enter URL:")
        if st.form_submit_button("Analyze") and url:
            result = st.session_state.api_client.analyze_url(url)
            if result and result.get("success"):
                task_id = result["task_id"]
                st.session_state.tasks[task_id] = {
                    "url": url,
                    "submitted_at": datetime.now(),
                    "status": "enqueued"
                }
                st.success(f"Analysis started - Task ID: {task_id}")

    # Task history and visualization
    if st.session_state.tasks:
        df = pd.DataFrame([
            {
                "task_id": tid,
                "url": data["url"],
                "submitted_at": data["submitted_at"],
                "status": st.session_state.api_client.get_task_status(tid).get("status", "unknown")
            }
            for tid, data in st.session_state.tasks.items()
        ])
        
        # Timeline visualization
        fig = px.timeline(
            df,
            x_start="submitted_at",
            x_end=datetime.now(),
            y="url",
            color="status",
            title="Task Processing Timeline"
        )
        st.plotly_chart(fig, use_container_width=True)
        
        # Detailed task table
        st.dataframe(
            df.sort_values("submitted_at", ascending=False),
            use_container_width=True
        )

        # Graph visualization for completed tasks
        completed_tasks = df[df["status"] == "completed"]
        if not completed_tasks.empty:
            st.subheader("Content Relationships")
            selected_url = st.selectbox(
                "Select URL to view relationships",
                completed_tasks["url"].tolist()
            )
            if selected_url:
                graph_data = st.session_state.api_client.get_graph_data(selected_url)
                if graph_data and graph_data.get("success"):
                    # Create network visualization
                    nodes = graph_data["nodes"]
                    edges = graph_data["relationships"]
                    
                    if nodes and edges:
                        # Create network graph using plotly
                        edge_x = []
                        edge_y = []
                        for edge in edges:
                            x0, y0 = nodes[edge["source"]]["pos"]
                            x1, y1 = nodes[edge["target"]]["pos"]
                            edge_x.extend([x0, x1, None])
                            edge_y.extend([y0, y1, None])
                            
                        node_x = [node["pos"][0] for node in nodes]
                        node_y = [node["pos"][1] for node in nodes]
                        
                        fig = go.Figure(data=[
                            go.Scatter(x=edge_x, y=edge_y, line=dict(width=0.5, color="#888"), hoverinfo="none", mode="lines"),
                            go.Scatter(x=node_x, y=node_y, mode="markers+text", text=[node["url"] for node in nodes],
                                     textposition="top center", hoverinfo="text")
                        ])
                        
                        fig.update_layout(showlegend=False, title="Content Graph")
                        st.plotly_chart(fig, use_container_width=True)
                    else:
                        st.info("No relationships found for this URL")

    # Refresh button
    if st.button("Refresh"):
        st.rerun()

if __name__ == "__main__":
    main()