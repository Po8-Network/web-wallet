import { MlDsa65 } from './crypto';

// Storage Keys
const STORAGE_KEY_KP = "po8_keypair";
const RPC_URL = "http://localhost:8833/rpc";

interface KeyPair {
    publicKey: number[];
    secretKey: number[];
}

interface StorageData {
    [STORAGE_KEY_KP]?: KeyPair;
}

// Helper for Hex Encoding
function toHex(buffer: Uint8Array): string {
    return Array.from(buffer).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Message Listener
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    // Keep the channel open for async response
    handleMessage(message).then(sendResponse);
    return true; 
});

async function handleMessage(request: any): Promise<any> {
    if (request.type === 'RPC_REQUEST') {
        return handleRpcRequest(request.method, request.params);
    }
    
    // Legacy Handlers (keep for popup if needed)
    if (request.type === 'GET_ACCOUNT') {
        const data = await chrome.storage.local.get(STORAGE_KEY_KP) as StorageData;
        const kp = data[STORAGE_KEY_KP];
        if (kp) {
            // Derive Address
            const pk = new Uint8Array(kp.publicKey);
            const address = await deriveAddress(pk);
            return { address };
        }
        return { address: null };
    }

    if (request.type === 'CREATE_ACCOUNT') {
        try {
            const kp = await MlDsa65.generateKeyPair();
            await chrome.storage.local.set({ 
                [STORAGE_KEY_KP]: {
                    publicKey: Array.from(kp.publicKey),
                    secretKey: Array.from(kp.secretKey)
                }
            });
            const address = await deriveAddress(kp.publicKey);
            return { success: true, address };
        } catch (e) {
            return { success: false, error: (e as any).toString() };
        }
    }
    
    return { error: "Unknown request type" };
}

async function handleRpcRequest(method: string, params: any[]): Promise<any> {
    const data = await chrome.storage.local.get(STORAGE_KEY_KP) as StorageData;
    const kp = data[STORAGE_KEY_KP];

    // Methods that don't need a wallet
    if (method === 'eth_chainId') {
        return { result: "0x539" }; // 1337
    }

    if (!kp) {
        return { error: "No wallet found. Please create one in the popup." };
    }
    
    const pk = new Uint8Array(kp.publicKey);
    const sk = new Uint8Array(kp.secretKey);
    const address = await deriveAddress(pk);

    switch (method) {
        case 'eth_requestAccounts':
        case 'eth_accounts':
            return { result: [address] };

        case 'eth_sendTransaction': {
            // Params: [{ from, to, value, data, ... }]
            const tx = params[0];
            if (!tx.to && !tx.data) return { error: "Invalid transaction" };
            
            // Construct Quantum Transaction
            const nonce = Date.now();
            const amount = BigInt(tx.value || "0").toString();
            // Data handling for contracts
            const dataStr = tx.data ? tx.data.replace('0x', '') : "";
            const recipient = tx.to || "0x"; // 0x for contract creation

            // Message format: recipient:amount:nonce:data
            const msgString = `${recipient}:${amount}:${nonce}:${dataStr}`;
            const encoder = new TextEncoder();
            const messageBytes = encoder.encode(msgString);

            // Sign
            const signature = await MlDsa65.sign(messageBytes, sk);

            const qtx = {
                sender_pk: toHex(pk),
                recipient: recipient,
                amount: amount,
                nonce: nonce,
                signature: toHex(signature),
                data: dataStr
            };

            // Broadcast
            try {
                const response = await fetch(RPC_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        method: 'send_transaction',
                        params: [qtx],
                        id: 1
                    })
                });
                const json = await response.json();
                if (json.error) return { error: json.error };
                return { result: json.result }; // Tx Hash or Result
            } catch (e) {
                return { error: "Network Error" };
            }
        }

        case 'personal_sign': {
            // Params: [message (hex), address]
            const msgHex = params[0];
            // Decode hex to bytes
            const msgBytes = hexToBytes(msgHex.replace('0x', ''));
            
            // Sign raw bytes
            const signature = await MlDsa65.sign(msgBytes, sk);
            return { result: "0x" + toHex(signature) };
        }

        default:
            return { error: `Method ${method} not implemented` };
    }
}

import { sha3_256 } from 'js-sha3';

// ... (inside deriveAddress)
async function deriveAddress(pk: Uint8Array): Promise<string> {
    // SHA3-256 match with Node
    const hashHex = sha3_256(pk);
    return "0x" + hashHex.substring(0, 40);
}

function hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes;
}
