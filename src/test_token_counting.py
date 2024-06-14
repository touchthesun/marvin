import unittest
from utils.tokens import num_tokens_from_messages

class TestTokenCounting(unittest.TestCase):
    def test_single_message_short(self):
        messages = [
            {"role": "user", "content": "Hello, world!"}
        ]
        expected_tokens = 8  # Assuming the expected token count is 8
        result = num_tokens_from_messages(messages)
        self.assertTrue(abs(result - expected_tokens) <= 3, f"Expected {expected_tokens} +/- 3, but got {result}")

    # Add more test cases here, with expected token counts and a fuzziness of +/- 3

if __name__ == '__main__':
    unittest.main()