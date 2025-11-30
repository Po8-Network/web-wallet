// EIP-1193 Provider Implementation
// This script is injected into the page to expose window.ethereum

class Po8Provider {
    isPo8 = true;
    callbacks = new Map();
    nextId = 1;

    constructor() {
        // Listen for responses from content script
        window.addEventListener('message', this.handleMessage.bind(this));
    }

    request(args: { method: string, params?: any[] }): Promise<any> {
        return new Promise((resolve, reject) => {
            const id = this.nextId++;
            this.callbacks.set(id, { resolve, reject });

            window.postMessage({
                target: 'PO8_CONTENT',
                data: {
                    id,
                    method: args.method,
                    params: args.params
                }
            }, '*');
        });
    }

    handleMessage(event: MessageEvent) {
        if (event.source !== window) return;
        const { target, data } = event.data;
        if (target !== 'PO8_INPAGE') return;

        if (data.id && this.callbacks.has(data.id)) {
            const { resolve, reject } = this.callbacks.get(data.id);
            this.callbacks.delete(data.id);

            if (data.error) {
                reject(new Error(data.error));
            } else {
                resolve(data.result);
            }
        } else if (data.method === 'po8_accountsChanged') {
            // Emit event (simple implementation)
            // if (this.on) this.emit('accountsChanged', data.result);
            console.log("Po8 Accounts Changed:", data.result);
        }
    }

    // Legacy support
    enable() {
        return this.request({ method: 'eth_requestAccounts' });
    }
}

// Inject
(window as any).ethereum = new Po8Provider();
(window as any).po8 = (window as any).ethereum;

console.log("Po8 Quantum Provider Injected");



