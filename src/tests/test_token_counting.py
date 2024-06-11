import unittest
from src.utils.tokens import num_tokens_from_messages

class TestTokenCounting(unittest.TestCase):
    def test_single_message_short(self):
        messages = [
            {"role": "user", "content": "Hello, world!"}
        ]
        expected_tokens = 8
        result = num_tokens_from_messages(messages)
        self.assertEqual(result, expected_tokens, f"Expected {expected_tokens} but got {result}")

    def test_multiple_messages(self):
        messages = [
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": "What is the weather like today?"}
        ]
        expected_tokens = 18
        result = num_tokens_from_messages(messages)
        self.assertEqual(result, expected_tokens, f"Expected {expected_tokens} but got {result}")

    def test_messages_with_names(self):
        messages = [
            {"role": "system", "name": "assistant", "content": "I am here to help."},
            {"role": "user", "name": "John Doe", "content": "Please assist me with my inquiry."}
        ]
        expected_tokens = 24
        result = num_tokens_from_messages(messages)
        self.assertEqual(result, expected_tokens, f"Expected {expected_tokens} but got {result}")

# If you are running this file directly, execute the tests
if __name__ == '__main__':
    unittest.main()
