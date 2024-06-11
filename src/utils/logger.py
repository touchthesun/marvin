import logging
from config import load_config

config = load_config()
# You can set a default logging level here and override it using an environment variable
default_logging_level = logging.INFO


def configure_logging():
    logging.basicConfig(
        level = config["logging_level"],
        filename="devlog.txt",
        filemode='w',  # 'a' appends to the file if it exists, 'w' overwrites
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S',
        encoding='utf-8'
    )

def get_logger(name):
    """
    Creates and returns a configured logger.

    Parameters:
    - name (str): Name of the logger, usually __name__ to reflect the module's name.

    Returns:
    - logger (logging.Logger): Configured logger instance.
    """
    return logging.getLogger(name)



def format_embedding_for_logging(embedding, preview_length=3):
    preview_start = ', '.join(map(str, embedding[:preview_length]))
    preview_end = ', '.join(map(str, embedding[-preview_length:]))
    return f"Embedding (length {len(embedding)}): [{preview_start} ... {preview_end}]"
