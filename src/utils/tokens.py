import tiktoken
from .logger import get_logger



logger = get_logger(__name__)

def num_tokens_from_messages(messages, model="gpt-3.5-turbo-0613"):
    """Return the number of tokens used by a list of messages."""
    try:
        encoding = tiktoken.encoding_for_model(model)
    except KeyError:
        logger.warning("Model not found: %s. Using cl100k_base encoding.", model)
        encoding = tiktoken.get_encoding("cl100k_base")
    
    num_tokens = 0
    for message in messages:
        role_tokens = len(encoding.encode(message["role"]))
        name_tokens = len(encoding.encode(message.get("name", ""))) if "name" in message else 0
        content_tokens = len(encoding.encode(message["content"]))
        total_message_tokens = role_tokens + name_tokens + content_tokens
        logger.info(f"Message: {message} Role tokens: {role_tokens}, Name tokens: {name_tokens}, Content tokens: {content_tokens}")
        num_tokens += total_message_tokens

        if "name" in message:
            name = message["name"]
            num_tokens += len(encoding.encode(name))

    # Optionally add any constant overhead per message or session initialization
    num_tokens += 3  # Example: static overhead for session initialization

    return num_tokens