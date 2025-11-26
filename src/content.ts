// Content script to inject the Po8 Provider into the page
console.log("Po8 Wallet Content Script Loaded");

// Inject the provider script (if we were using a separate inject file)
// For now, we'll just listen for window messages and relay to background

window.addEventListener('message', async (event) => {
    // Only accept messages from the same window
    if (event.source !== window) return;

    if (event.data.type && event.data.type === 'PO8_REQUEST') {
        // Forward to background
        try {
            const response = await chrome.runtime.sendMessage(event.data.payload);
            window.postMessage({ type: 'PO8_RESPONSE', id: event.data.id, payload: response }, '*');
        } catch (err) {
            console.error("Po8 Wallet Error:", err);
            window.postMessage({ type: 'PO8_RESPONSE', id: event.data.id, error: "Extension Error" }, '*');
        }
    }
});

