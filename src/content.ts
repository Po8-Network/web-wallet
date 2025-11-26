// Content script to inject the Po8 Provider into the page
console.log("Po8 Wallet Content Script Loaded");

// Inject the inpage script
const script = document.createElement('script');
// CRXJS usually compiles src/inpage.ts -> assets/inpage.ts.<hash>.js
// To get the URL, we can use chrome.runtime.getURL with the EXACT name in manifest?
// Or we might need to rely on CRXJS logic.
// A common pattern with CRXJS is to import the script URL.
// But we are in a content script file here.

// Let's try to trust CRXJS to map 'src/inpage.ts' to the right output if we ask for it via getURL?
// Actually, usually you do: import scriptUrl from './inpage.ts?script'
// But that requires modern setup.

// Fallback: If we use the raw name in manifest, CRXJS should output it.
script.src = chrome.runtime.getURL('src/inpage.ts'); 
script.onload = function() {
    (this as any).remove();
};
(document.head || document.documentElement).appendChild(script);

// Listen for messages from the page (Provider)
window.addEventListener('message', async (event) => {
    // Only accept messages from the same window
    if (event.source !== window) return;
    
    // Check for our specific protocol
    const { target, data } = event.data;
    if (target !== 'PO8_CONTENT') return;

    // Forward to background
    try {
        const response = await chrome.runtime.sendMessage({
            type: 'RPC_REQUEST',
            method: data.method,
            params: data.params
        });

        // Send response back to page
        window.postMessage({
            target: 'PO8_INPAGE',
            data: {
                id: data.id,
                result: response.result,
                error: response.error
            }
        }, '*');

    } catch (err) {
        console.error("Po8 Wallet Error:", err);
        window.postMessage({
            target: 'PO8_INPAGE',
            data: {
                id: data.id,
                error: "Extension Error: " + (err as any).message
            }
        }, '*');
    }
});
