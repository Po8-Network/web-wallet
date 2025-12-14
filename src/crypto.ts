import mldsa from 'mldsa-wasm';

export interface KeyPair {
    publicKey: Uint8Array;
    secretKey: Uint8Array;
}

export class MlDsa65 {
    static async generateKeyPair(): Promise<KeyPair> {
        console.log("Generating ML-DSA-65 KeyPair (WASM)...");
        
        const keyPair = await mldsa.generateKey("ML-DSA-65", true, ["sign", "verify"]);
        
        const publicKeyBuffer = await mldsa.exportKey("raw-public", keyPair.publicKey);
        // We use raw-seed for compact storage (32 bytes) if available, otherwise fallback might be needed
        // but the types say 'raw-seed' is supported.
        const secretKeyBuffer = await mldsa.exportKey("raw-seed", keyPair.privateKey);
        
        return { 
            publicKey: new Uint8Array(publicKeyBuffer), 
            secretKey: new Uint8Array(secretKeyBuffer) 
        };
    }

    static async sign(message: Uint8Array, secretKey: Uint8Array): Promise<Uint8Array> {
        console.log("Signing message with ML-DSA-65...");
        
        // Import the secret key (seed)
        const sk = await mldsa.importKey(
            "raw-seed", 
            secretKey as unknown as BufferSource, 
            "ML-DSA-65", 
            true, 
            ["sign"]
        );

        const signatureBuffer = await mldsa.sign("ML-DSA-65", sk, message as unknown as BufferSource);
        return new Uint8Array(signatureBuffer);
    }

    static async verify(message: Uint8Array, signature: Uint8Array, publicKey: Uint8Array): Promise<boolean> {
        const pk = await mldsa.importKey(
            "raw-public", 
            publicKey as unknown as BufferSource, 
            "ML-DSA-65", 
            true, 
            ["verify"]
        );

        return await mldsa.verify("ML-DSA-65", pk, signature as unknown as BufferSource, message as unknown as BufferSource);
    }
}

export class AesCrypto {
    static async deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            "raw",
            enc.encode(password),
            { name: "PBKDF2" },
            false,
            ["deriveBits", "deriveKey"]
        );

        return await crypto.subtle.deriveKey(
            {
                name: "PBKDF2",
                salt: salt,
                iterations: 100000,
                hash: "SHA-256"
            },
            keyMaterial,
            { name: "AES-GCM", length: 256 },
            true,
            ["encrypt", "decrypt"]
        );
    }

    static async encrypt(data: Uint8Array, password: string): Promise<{ ciphertext: Uint8Array, salt: Uint8Array, iv: Uint8Array }> {
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const key = await this.deriveKey(password, salt);

        const ciphertextBuffer = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv: iv },
            key,
            data
        );

        return {
            ciphertext: new Uint8Array(ciphertextBuffer),
            salt,
            iv
        };
    }

    static async decrypt(ciphertext: Uint8Array, password: string, salt: Uint8Array, iv: Uint8Array): Promise<Uint8Array> {
        const key = await this.deriveKey(password, salt);
        
        const decryptedBuffer = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: iv },
            key,
            ciphertext
        );
        
        return new Uint8Array(decryptedBuffer);
    }
}
