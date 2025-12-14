import { MlDsa65, AesCrypto } from './crypto';
import { sha3_256 } from 'js-sha3';

// Storage Keys
const STORAGE_KEY_VAULT = "po8_vault";
const STORAGE_KEY_SETTINGS = "po8_settings";
const STORAGE_KEY_SESSION = "po8_session";

const LOCK_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const MAX_PACKET = 16 * 1024; // 16KB limit to fit in Sphinx (32KB) with overhead

interface KeyPair {
    publicKey: number[];
    secretKey: number[];
}

interface Vault {
    ciphertext: string; // Base64
    salt: string;       // Base64
    iv: string;         // Base64
    address: string;    // Public address (visible even when locked)
}

interface Settings {
    rpcUrl: string;
    chainId: number;
}

interface SessionData {
    keypair: KeyPair;
    lastActive: number;
}

const DEFAULT_SETTINGS: Settings = {
    rpcUrl: "http://localhost:8833/rpc",
    chainId: 1337
};

// --- Helpers ---

function toHex(buffer: Uint8Array): string {
    return Array.from(buffer).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
    hex = hex.replace(/^0x/, '');
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes;
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

async function deriveAddress(pk: Uint8Array): Promise<string> {
    const hashHex = sha3_256(pk);
    return "0x" + hashHex.substring(0, 40);
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

// --- State Management (Async) ---

async function getSession(): Promise<KeyPair | null> {
    try {
        // Use chrome.storage.session (in-memory, survives SW restarts, clears on browser close)
        const data = await chrome.storage.session.get(STORAGE_KEY_SESSION);
        if (!data || !data[STORAGE_KEY_SESSION]) return null;

        const session = data[STORAGE_KEY_SESSION] as SessionData;
        
        // Auto-lock check
        if (Date.now() - session.lastActive > LOCK_TIMEOUT_MS) {
            await clearSession();
            return null;
        }

        // Update activity timestamp to keep session alive
        await updateActivity(session);
        return session.keypair;
    } catch (e) {
        return null;
    }
}

async function setSession(kp: KeyPair) {
    const session: SessionData = {
        keypair: kp,
        lastActive: Date.now()
    };
    await chrome.storage.session.set({ [STORAGE_KEY_SESSION]: session });
}

async function updateActivity(currentSession?: SessionData) {
    const session = currentSession || (await chrome.storage.session.get(STORAGE_KEY_SESSION))[STORAGE_KEY_SESSION];
    if (session) {
        session.lastActive = Date.now();
        await chrome.storage.session.set({ [STORAGE_KEY_SESSION]: session });
    }
}

async function clearSession() {
    await chrome.storage.session.remove(STORAGE_KEY_SESSION);
}

async function getSettings(): Promise<Settings> {
    const data = await chrome.storage.local.get(STORAGE_KEY_SETTINGS);
    if (data && data[STORAGE_KEY_SETTINGS]) {
        return { ...DEFAULT_SETTINGS, ...data[STORAGE_KEY_SETTINGS] };
    }
    return { ...DEFAULT_SETTINGS };
}

async function saveSettings(settings: Settings) {
    await chrome.storage.local.set({ [STORAGE_KEY_SETTINGS]: settings });
}

// --- Handlers ---

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    handleMessage(message).then(sendResponse);
    return true; 
});

export async function handleMessage(request: any): Promise<any> {
    if (request.type === 'RPC_REQUEST') {
        return handleRpcRequest(request.method, request.params);
    }

    if (request.type === 'GET_STATUS') {
        const vaultData = await chrome.storage.local.get(STORAGE_KEY_VAULT);
        const hasVault = !!vaultData[STORAGE_KEY_VAULT];
        
        const kp = await getSession();
        const isUnlocked = !!kp;
        
        let address = null;
        if (kp) {
            address = await deriveAddress(new Uint8Array(kp.publicKey));
        } else if (hasVault) {
             address = vaultData[STORAGE_KEY_VAULT].address;
        }

        const settings = await getSettings();
        
        return { hasVault, isUnlocked, address, settings };
    }

    if (request.type === 'CREATE_VAULT') {
        try {
            const password = request.password;
            if (!password) return { error: "Password required" };

            const kp = await MlDsa65.generateKeyPair();
            const kpJson = JSON.stringify({
                publicKey: Array.from(kp.publicKey),
                secretKey: Array.from(kp.secretKey)
            });

            const enc = new TextEncoder();
            const encrypted = await AesCrypto.encrypt(enc.encode(kpJson), password);
            const address = await deriveAddress(kp.publicKey);

            const vault: Vault = {
                ciphertext: toBase64(encrypted.ciphertext),
                salt: toBase64(encrypted.salt),
                iv: toBase64(encrypted.iv),
                address
            };

            await chrome.storage.local.set({ [STORAGE_KEY_VAULT]: vault });
            
            // Auto-unlock
            await setSession({
                publicKey: Array.from(kp.publicKey),
                secretKey: Array.from(kp.secretKey)
            });

            return { success: true, address };
        } catch (e) {
            return { error: (e as any).toString() };
        }
    }

    if (request.type === 'UNLOCK_VAULT') {
        try {
            const password = request.password;
            const vaultData = await chrome.storage.local.get(STORAGE_KEY_VAULT);
            const vault = vaultData[STORAGE_KEY_VAULT] as Vault;
            if (!vault) return { error: "No vault found" };

            const plaintextBuffer = await AesCrypto.decrypt(
                fromBase64(vault.ciphertext),
                password,
                fromBase64(vault.salt),
                fromBase64(vault.iv)
            );

            const dec = new TextDecoder();
            const kp = JSON.parse(dec.decode(plaintextBuffer)) as KeyPair;

            await setSession(kp);
            return { success: true, address: vault.address };
        } catch (e) {
            return { success: false, error: "Incorrect password" };
        }
    }

    if (request.type === 'LOCK_VAULT') {
        await clearSession();
        return { success: true };
    }

    if (request.type === 'SAVE_SETTINGS') {
        if (request.settings) {
            await saveSettings(request.settings);
        }
        return { success: true };
    }

    // Legacy support
    if (request.type === 'GET_ACCOUNT') {
        const kp = await getSession();
        if (kp) {
            const pk = new Uint8Array(kp.publicKey);
            const address = await deriveAddress(pk);
            return { address };
        }
        return { address: null };
    }

    return { error: "Unknown request type" };
}

async function handleRpcRequest(method: string, params: any[]): Promise<any> {
    const settings = await getSettings();

    // Public methods
    if (['eth_chainId', 'eth_blockNumber', 'eth_getBalance', 'eth_call', 'eth_estimateGas', 'get_balance', 'net_version', 'eth_getCode', 'eth_gasPrice'].includes(method)) {
         return forwardToNode(method, params, settings);
    }

    const kp = await getSession();
    if (!kp) {
        return { error: "Wallet locked" };
    }
    
    const pk = new Uint8Array(kp.publicKey);
    const sk = new Uint8Array(kp.secretKey);
    const address = await deriveAddress(pk);

    switch (method) {
        case 'eth_requestAccounts':
        case 'eth_accounts':
            return { result: [address] };

        case 'eth_sendTransaction': {
            const tx = params[0];
            if (!tx.to && !tx.data) return { error: "Invalid transaction" };
            
            const recipient = tx.to || "0x";
            
            // 1. Fetch Nonce from Node
            const nonceRes = await forwardToNode('eth_getTransactionCount', [address, 'latest'], settings);
            let nonce = 0;
            if (nonceRes.result) {
                nonce = parseInt(nonceRes.result, 16);
            } else {
                 nonce = Date.now();
            }

            const amount = BigInt(tx.value || "0").toString();
            const dataStr = tx.data ? tx.data.replace('0x', '') : "";
            
            const msgString = `${recipient}:${amount}:${nonce}:${dataStr}`;
            const encoder = new TextEncoder();
            const messageBytes = encoder.encode(msgString);

            const signature = await MlDsa65.sign(messageBytes, sk);

            const qtx = {
                sender_pk: toHex(pk),
                recipient: recipient,
                amount: amount,
                nonce: nonce,
                signature: toHex(signature),
                data: dataStr
            };

            const response = await forwardToNode('send_transaction', [qtx], settings);
            return response;
        }

        case 'personal_sign': {
            const msgHex = params[0];
            const msgBytes = hexToBytes(msgHex.replace('0x', ''));
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
            const nonce = Date.now();

            // Construct message to sign: recipient + payload (as per Node verification)
            // Node: msg_bytes = recipient.as_bytes() + payload_bytes
            // In Node, recipient is string "0x...", payload_bytes is padded bytes.
            const recipientBytes = new TextEncoder().encode(recipient);
            const msgToSign = new Uint8Array(recipientBytes.length + padded.length);
            msgToSign.set(recipientBytes);
            msgToSign.set(padded, recipientBytes.length);

            const signature = await MlDsa65.sign(msgToSign, sk);

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

            const res = await forwardToNode('mix_send', [body], settings);
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

            const res = await forwardToNode('mix_poll', [body], settings);
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
            return forwardToNode(method, params, settings);
    }
}

async function forwardToNode(method: string, params: any[], settings: Settings): Promise<any> {
    try {
        const response = await fetch(settings.rpcUrl, {
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
        return { error: "Network Error" };
    }
}
