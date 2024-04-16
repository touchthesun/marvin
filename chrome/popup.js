document.getElementById('captureTabsButton').addEventListener('click', () => {
    chrome.runtime.sendMessage({action: "captureTabs"});
  });
  
  document.addEventListener('DOMContentLoaded', function() {
    const chatList = document.getElementById('chat');
    const userInput = document.getElementById('userInput');
    const sendBtn = document.getElementById('sendBtn');

    // Function to add a message to the chat
    function addMessage(text, isUser = true) {
        const li = document.createElement('li');
        li.classList.add('message');
        li.textContent = text;
        li.style.textAlign = isUser ? 'right' : 'left';
        chatList.appendChild(li);
    }

    // Send a message when the send button is clicked
    sendBtn.addEventListener('click', function() {
        const message = userInput.value.trim();
        if (message) {
            addMessage(message); // Display user's message
            userInput.value = ''; // Clear input field

            // Here, you'd typically send the message to your backend for processing
            // For demonstration, we'll simulate a response from Marvin
            setTimeout(() => {
                const marvinResponse = `Marvin says: ${message.split('').reverse().join('')}`; // Simulate a response
                addMessage(marvinResponse, false); // Display Marvin's response
            }, 500);
        }
    });
});
