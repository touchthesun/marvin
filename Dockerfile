# Use the official lightweight Python image.
# https://hub.docker.com/_/python
FROM python:3.9-slim

# Working directory for our application
WORKDIR /app

# Install pip requirements
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt
RUN python -m spacy download en_core_web_sm

# Streamlit runs on port 8501 by default
EXPOSE 8501

# Copy local code to the container image.
COPY . .

# Command to run the streamlit app
CMD ["streamlit", "run", "src/app.py"]
