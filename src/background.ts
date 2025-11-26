// Helper for Hex Encoding
function toHex(buffer: Uint8Array): string {
    return Array.from(buffer).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ... (inside handleMessage) ...

    if (request.type === 'SIGN_TRANSACTION') {
        const data = await chrome.storage.local.get(STORAGE_KEY_KP) as StorageData;
        const kp = data[STORAGE_KEY_KP];
        if (!kp) return { success: false, error: "No wallet" };

        if (!request.payload || !request.payload.recipient || !request.payload.amount) {
            return { success: false, error: "Invalid payload" }; 
        }

        // 1. Construct Message to Sign
        // Format: "recipient:amount:nonce" (Matches Node's verification logic)
        const nonce = Date.now(); // Using timestamp as nonce for MVP uniqueness
        const msgString = `${request.payload.recipient}:${request.payload.amount}:${nonce}`;
        const encoder = new TextEncoder();
        const messageBytes = encoder.encode(msgString);

        // 2. Sign with ML-DSA-65
        const signature = await MlDsa65.sign(messageBytes, new Uint8Array(kp.secretKey));
        
        // 3. Construct Quantum Transaction Payload
        const qtx = {
            sender_pk: toHex(new Uint8Array(kp.publicKey)),
            recipient: request.payload.recipient,
            amount: request.payload.amount,
            nonce: nonce,
            signature: toHex(signature)
        };

        // 4. Broadcast to Node via JSON-RPC
        try {
             const response = await fetch(RPC_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'send_transaction',
                    params: [qtx], // Send JSON object, not string
                    id: 2
                })
            });
            
            const json = await response.json();
            if (json.error) {
                return { success: false, error: json.error };
            }
            return { success: true, signature: Array.from(signature) }; // Return sig on success
        } catch (e) {
             console.error("Broadcast failed", e);
             return { success: false, error: "Network Error" };
        }
    }
