# Po8 Web Wallet

A Manifest V3 Chrome Extension wallet for the Po8 Network.

## Features

*   **Quantum Safe**: Generates ML-DSA-65 keys and signs transactions using WASM.
*   **EVM Compatible**: Sends transactions to the Po8 Node's QAL-enabled JSON-RPC.
*   **Non-Custodial**: Private keys are stored locally in Chrome Storage.

## Installation

1.  **Build:**
    ```bash
    npm install
    npm run build
    ```
2.  **Load in Chrome:**
    *   Go to `chrome://extensions/`
    *   Enable "Developer mode"
    *   Click "Load unpacked"
    *   Select the `dist` folder.

## Development

### Integrated (Recommended)
From the project root:
```bash
npm run dev
```
This runs the wallet dev server on `http://localhost:3000` alongside the backend node.

### Standalone
```bash
npm run dev
```
This will watch for changes and rebuild the extension.

## Testing

Run unit and integration tests:
```bash
npx vitest run
```



