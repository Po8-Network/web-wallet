import { MlDsa65 } from './crypto';

// Storage Keys
const STORAGE_KEY_KP = "po8_keypair";
const RPC_URL = "http://localhost:8833/rpc";
const MAX_PACKET = 32 * 1024;

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

function toBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

// Message Listener
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    // Keep the channel open for async response
    handleMessage(message).then(sendResponse);
    return true; 
});

export async function handleMessage(request: any): Promise<any> {
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

    // Forward chainId to node to ensure sync
    // if (method === 'eth_chainId') ... removed

    if (!kp) {
        // If method is something that doesn't need auth, we can forward it?
        // But for now, let's allow forwarding all public methods even without wallet?
        // Currently 'default' block requires no wallet checks, but we return early here if !kp.
        // This prevents 'eth_blockNumber' etc from working if no wallet is created.
        // We should move this check inside the cases that require it.
    }
    
    // Public methods that don't require wallet
    if (['eth_chainId', 'eth_blockNumber', 'eth_getBalance', 'eth_call', 'eth_estimateGas', 'get_balance', 'net_version'].includes(method)) {
         return forwardToNode(method, params);
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

        case 'po8_sendMessage': {
            const msgObj = params[0] || {};
            const recipient = msgObj.to || msgObj.recipient;
            const dataStr = msgObj.data ?? msgObj.payload ?? '';
            const ttl = typeof msgObj.ttl === 'number' ? Math.max(1, Math.min(900, Math.floor(msgObj.ttl))) : 300;
            const kind = typeof msgObj.kind === 'string' ? msgObj.kind : 'msg';
            const ack_for = typeof msgObj.ack_for === 'string' ? msgObj.ack_for : undefined;
            if (!recipient || typeof dataStr !== 'string') {
                return { error: "Invalid params" };
            }

            const encoder = new TextEncoder();
            const payload = encoder.encode(dataStr);
            if (payload.length > (MAX_PACKET - 4)) {
                return { error: "Message too large" };
            }
            const padded = encodePayload(payload);
            const signature = await MlDsa65.sign(padded, sk);
            const nonce = Date.now();

            const body = {
                recipient,
                sender_pk: toHex(pk),
                signature: toHex(signature),
                payload: toBase64(padded),
                nonce,
                ttl,
                kind,
                ack_for
            };

            const res = await forwardToNode('mix_send', [body]);
            return res;
        }

        case 'po8_getMessages': {
            const recipient = address;
            const pollMsg = new TextEncoder().encode(`poll:${recipient}`);
            const signature = await MlDsa65.sign(pollMsg, sk);

            const body = {
                recipient,
                public_key: toHex(pk),
                signature: toHex(signature)
            };

            const res = await forwardToNode('mix_poll', [body]);
            if (res.error) return res;

            const messages = Array.isArray(res.result) ? res.result : [];
            const decoder = new TextDecoder();
            const normalized = messages.map((m: any) => {
                const payloadBytes = fromBase64(m.payload_b64 || '');
                const decoded = decodePayload(payloadBytes, decoder);
                return {
                    from: m.sender_pk,
                    timestamp: m.timestamp,
                    nonce: m.nonce,
                    expiry: m.expiry,
                    kind: m.kind,
                    ack_for: m.ack_for,
                    message: decoded
                };
            });

            return { result: normalized };
        }

        default:
            return forwardToNode(method, params);
    }
}

async function forwardToNode(method: string, params: any[]): Promise<any> {
    try {
        const response = await fetch(RPC_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                method: method,
                params: params,
                id: 1
            })
        });
        const json = await response.json();
        if (json.error) return { error: json.error };
        return { result: json.result };
    } catch (e) {
        return { error: "Network Error or Method Not Supported" };
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

function encodePayload(payload: Uint8Array): Uint8Array {
    const padded = new Uint8Array(MAX_PACKET);
    const view = new DataView(padded.buffer);
    view.setUint32(0, payload.length, true);
    padded.set(payload, 4);
    return padded;
}

function decodePayload(padded: Uint8Array, decoder: TextDecoder): string {
    if (padded.length < 4) return '';
    const view = new DataView(padded.buffer, padded.byteOffset, padded.byteLength);
    const len = view.getUint32(0, true);
    const slice = padded.slice(4, 4 + Math.min(len, padded.length - 4));
    return decoder.decode(slice);
}
