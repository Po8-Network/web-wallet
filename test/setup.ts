import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Setup Global Chrome Mock
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
         // This mock needs to be somewhat dynamic or accessible by tests if we want to assert on it.
         // For now, a simple mock to prevent crashes.
         // Tests can spyOn chrome.storage.local.get to change implementation.
         return Promise.resolve({}); 
      }),
      set: vi.fn(() => Promise.resolve())
    }
  }
} as any;
