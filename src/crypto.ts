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
