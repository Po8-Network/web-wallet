import { describe, it, expect, vi } from 'vitest';
import { MlDsa65 } from '../src/crypto';

// Mock mldsa-wasm since it likely depends on browser environment or WASM loading which might be tricky in JSDOM
// or if it works in Node/JSDOM directly, even better.
// But usually WASM in vitest/jsdom needs setup. For now, let's try to mock the behavior or see if it runs.
// If mldsa-wasm is not compatible with Node environment (where vitest runs), we might need to mock it.

// Assuming for now we want to test the wrapper logic, we can mock the underlying library.
vi.mock('mldsa-wasm', () => ({
  default: {
    generateKey: vi.fn().mockResolvedValue({ publicKey: {}, privateKey: {} }),
    exportKey: vi.fn().mockImplementation((format, key) => {
        if (format === 'raw-public') return Promise.resolve(new Uint8Array(1312));
        if (format === 'raw-seed') return Promise.resolve(new Uint8Array(32));
        return Promise.resolve(new Uint8Array(0));
    }),
    importKey: vi.fn().mockResolvedValue({}),
    sign: vi.fn().mockResolvedValue(new Uint8Array(2420)), // Approx ML-DSA-65 sig size
    verify: vi.fn().mockResolvedValue(true),
  }
}));

describe('MlDsa65 Crypto Wrapper', () => {
  it('should generate a keypair', async () => {
    const keypair = await MlDsa65.generateKeyPair();
    expect(keypair.publicKey).toBeInstanceOf(Uint8Array);
    expect(keypair.secretKey).toBeInstanceOf(Uint8Array);
    // Based on our mock
    expect(keypair.publicKey.length).toBe(1312);
    expect(keypair.secretKey.length).toBe(32);
  });

  it('should sign a message', async () => {
    const msg = new TextEncoder().encode("Hello Quantum");
    const secretKey = new Uint8Array(32); // Mock key
    const sig = await MlDsa65.sign(msg, secretKey);
    
    expect(sig).toBeInstanceOf(Uint8Array);
    expect(sig.length).toBeGreaterThan(0);
  });

  it('should verify a signature', async () => {
    const msg = new TextEncoder().encode("Hello Quantum");
    const publicKey = new Uint8Array(1312); // Mock key
    const signature = new Uint8Array(2420); // Mock sig
    
    const isValid = await MlDsa65.verify(msg, signature, publicKey);
    expect(isValid).toBe(true);
  });
});




