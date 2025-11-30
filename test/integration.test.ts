import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MlDsa65 } from '../src/crypto';

// Mock dependencies
vi.mock('../src/crypto', () => ({
  MlDsa65: {
    generateKeyPair: vi.fn().mockResolvedValue({
      publicKey: new Uint8Array([1, 2, 3]), // Mock PK
      secretKey: new Uint8Array([4, 5, 6])  // Mock SK
    }),
    sign: vi.fn().mockResolvedValue(new Uint8Array([9, 9, 9])) // Mock Sig
  }
}));

// Mock chrome API
const mockStorage: Record<string, any> = {};
global.chrome = {
  runtime: {
    onMessage: {
      addListener: vi.fn()
    }
  },
  storage: {
    local: {
      get: vi.fn((key) => {
        if (typeof key === 'string') return Promise.resolve({ [key]: mockStorage[key] });
        return Promise.resolve(mockStorage); // simplistic
      }),
      set: vi.fn((obj) => {
        Object.assign(mockStorage, obj);
        return Promise.resolve();
      })
    }
  }
} as any;

// Mock fetch
global.fetch = vi.fn().mockResolvedValue({
  json: () => Promise.resolve({ result: "0xHash" })
});

// We need to import background.ts logic. 
// Since background.ts has side effects (chrome listeners), we might want to extract the handler or just import it and use the exposed listeners.
// But mostly we want to test the `handleMessage` logic.
// Ideally, `background.ts` should export `handleMessage` for testing.
// I will assume I can modify `background.ts` to export it or just copy/paste logic if I can't export.
// Let's modify `background.ts` to export `handleMessage` first.

import { handleMessage } from '../src/background'; 

describe('Wallet Integration Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key in mockStorage) delete mockStorage[key];
  });

  it('should create an account', async () => {
    const response = await handleMessage({ type: 'CREATE_ACCOUNT' });
    
    expect(response.success).toBe(true);
    expect(response.address).toMatch(/^0x/);
    expect(mockStorage['po8_keypair']).toBeDefined();
  });

  it('should handle eth_sendTransaction by converting to Quantum Transaction', async () => {
    // 1. Setup Wallet
    await handleMessage({ type: 'CREATE_ACCOUNT' });

    // 2. Send Transaction
    const txParams = {
      to: "0x1234567890123456789012345678901234567890",
      value: "1000",
      data: "0xabcdef"
    };

    const response = await handleMessage({
      type: 'RPC_REQUEST',
      method: 'eth_sendTransaction',
      params: [txParams]
    });

    // 3. Verify Result
    expect(response.result).toBe("0xHash");

    // 4. Verify fetch call structure (The key integration point)
    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:8833/rpc",
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"method":"send_transaction"')
      })
    );

    const callArgs = (global.fetch as any).mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    const qtx = body.params[0];

    // Check Quantum Transaction fields
    expect(qtx.sender_pk).toBe("010203"); // Hex of [1,2,3]
    expect(qtx.recipient).toBe(txParams.to);
    expect(qtx.amount).toBe(txParams.value);
    expect(qtx.signature).toBe("090909"); // Hex of [9,9,9]
    expect(qtx.data).toBe("abcdef");
    expect(qtx.nonce).toBeDefined();
  });
});

