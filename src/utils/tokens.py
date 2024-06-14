import tiktoken

def num_tokens_from_messages(messages, model="gpt-3.5-turbo-0613"):
    """Return an approximate number of tokens used by a list of messages."""
    try:
        encoding = tiktoken.encoding_for_model(model)
    except KeyError:
        print(f"Warning: Model not found: {model}. Using cl100k_base encoding.")
        encoding = tiktoken.get_encoding("cl100k_base")

    num_tokens = 0
    for message in messages:
        num_tokens += len(encoding.encode(message["role"]))
        num_tokens += len(encoding.encode(message["content"]))

        # Assume a constant overhead of 3 tokens for each message
        num_tokens += 3

    # Assume a constant overhead of 3 tokens for session initialization
    num_tokens += 3

    return num_tokens