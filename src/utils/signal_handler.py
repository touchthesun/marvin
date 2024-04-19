import threading
import signal
import sys
from db import Neo4jConnection

def signal_handler(sig, frame):
    print(f'Shutting down gracefully due to signal: {sig}')
    # If specific cleanup is needed based on the signal
    if sig == signal.SIGINT:
        print("Caught interrupt signal (CTRL+C).")
    elif sig == signal.SIGTERM:
        print("Caught terminate signal (from system).")
    Neo4jConnection.close_services()
    sys.exit(0)

def setup_signal_handling():
    if threading.current_thread() == threading.main_thread():
        print("Setting up signal handling on main thread.")
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)
    else:
        print("Signal handling not set up (not main thread).")
