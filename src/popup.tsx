import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import QRCode from "react-qr-code";

interface WalletStatus {
    hasVault: boolean;
    isUnlocked: boolean;
    address: string | null;
    settings: { rpcUrl: string; chainId: number };
}

interface Transaction {
    hash: string;
    recipient: string;
    amount: string;
    timestamp: number;
    status: string;
}

const styles = {
    container: {
        width: '350px',
        padding: '0',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        backgroundColor: '#0f172a',
        color: '#e2e8f0',
        minHeight: '500px',
        display: 'flex',
        flexDirection: 'column' as const,
    },
    header: {
        padding: '20px',
        borderBottom: '1px solid #1e293b',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
    },
    title: {
        margin: 0,
        fontSize: '18px',
        fontWeight: 600,
        color: '#38bdf8',
    },
    networkBadge: {
        fontSize: '10px',
        padding: '4px 8px',
        borderRadius: '12px',
        backgroundColor: '#1e293b',
        color: '#94a3b8',
        fontWeight: 600,
        border: '1px solid #334155',
        cursor: 'pointer'
    },
    content: {
        padding: '20px',
        flex: 1,
        display: 'flex',
        flexDirection: 'column' as const,
    },
    card: {
        backgroundColor: '#1e293b',
        borderRadius: '12px',
        padding: '16px',
        marginBottom: '16px',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    },
    label: {
        fontSize: '11px',
        textTransform: 'uppercase' as const,
        letterSpacing: '0.05em',
        color: '#94a3b8',
        marginBottom: '8px',
        display: 'block',
    },
    value: {
        fontSize: '13px',
        fontFamily: "'JetBrains Mono', monospace",
        wordBreak: 'break-all' as const,
        lineHeight: '1.4',
    },
    balance: {
        fontSize: '32px',
        fontWeight: 700,
        color: '#f8fafc',
    },
    balanceLabel: {
        fontSize: '14px',
        color: '#94a3b8',
        marginLeft: '4px',
    },
    button: {
        width: '100%',
        padding: '14px',
        backgroundColor: '#38bdf8',
        color: '#0f172a',
        border: 'none',
        borderRadius: '8px',
        fontSize: '14px',
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'background 0.2s',
        marginBottom: '10px'
    },
    secondaryButton: {
        width: '100%',
        padding: '14px',
        backgroundColor: 'transparent',
        color: '#94a3b8',
        border: '1px solid #334155',
        borderRadius: '8px',
        fontSize: '14px',
        fontWeight: 500,
        cursor: 'pointer',
        marginTop: '10px',
    },
    input: {
        width: '100%',
        padding: '12px',
        backgroundColor: '#0f172a',
        border: '1px solid #334155',
        borderRadius: '8px',
        color: 'white',
        fontSize: '14px',
        marginBottom: '16px',
        boxSizing: 'border-box' as const,
    },
    error: {
        color: '#ef4444',
        fontSize: '13px',
        marginTop: '8px',
        textAlign: 'center' as const,
    },
    txItem: {
        borderBottom: '1px solid #334155',
        padding: '12px 0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
    },
    txHash: {
        fontSize: '12px',
        color: '#38bdf8',
        fontFamily: "'JetBrains Mono', monospace",
    },
    txMeta: {
        fontSize: '11px',
        color: '#64748b'
    },
    txAmount: {
        fontWeight: 600,
        color: '#e2e8f0'
    },
};

function Popup() {
    const [status, setStatus] = useState<WalletStatus | null>(null);
    const [loading, setLoading] = useState(false);
    const [view, setView] = useState<'loading' | 'create' | 'unlock' | 'main' | 'send' | 'receive' | 'settings'>('loading');
    
    // Data
    const [balance, setBalance] = useState('0');
    const [history, setHistory] = useState<Transaction[]>([]);
    const [error, setError] = useState<string | null>(null);

    // Inputs
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [recipient, setRecipient] = useState('');
    const [amount, setAmount] = useState('');
    
    // Settings Inputs
    const [rpcUrl, setRpcUrl] = useState('');
    const [chainId, setChainId] = useState('');

    useEffect(() => {
        checkStatus();
    }, []);

    const checkStatus = () => {
        chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (res: WalletStatus) => {
            setStatus(res);
            if (!res.hasVault) {
                setView('create');
            } else if (!res.isUnlocked) {
                setView('unlock');
            } else {
                setView('main');
                refreshData();
            }
        });
    };

    const refreshData = () => {
        chrome.runtime.sendMessage({ type: 'RPC_REQUEST', method: 'eth_getBalance', params: [status?.address, 'latest'] }, (res) => {
            if (res && res.result) {
                // Convert Wei hex to PO8 (simplified)
                const wei = BigInt(res.result);
                const po8 = Number(wei) / 1e18; // Approx
                setBalance(po8.toFixed(4));
            }
        });
        // History mocking or real fetch via custom RPC needed
    };

    const handleCreate = () => {
        if (password.length < 8) {
            setError("Password must be at least 8 characters");
            return;
        }
        if (password !== confirmPassword) {
            setError("Passwords do not match");
            return;
        }
        setLoading(true);
        chrome.runtime.sendMessage({ type: 'CREATE_VAULT', password }, (res) => {
            setLoading(false);
            if (res.success) {
                checkStatus();
            } else {
                setError(res.error || "Creation failed");
            }
        });
    };

    const handleUnlock = () => {
        setLoading(true);
        chrome.runtime.sendMessage({ type: 'UNLOCK_VAULT', password }, (res) => {
            setLoading(false);
            if (res.success) {
                setPassword(''); // Clear sensitive data
                checkStatus();
            } else {
                setError(res.error || "Unlock failed");
            }
        });
    };

    const handleLock = () => {
        chrome.runtime.sendMessage({ type: 'LOCK_VAULT' }, () => {
            checkStatus();
        });
    };

    const handleSend = () => {
        if (!recipient || !amount) {
            setError("Please fill all fields");
            return;
        }
        // Amount to Wei
        const val = BigInt(Math.floor(parseFloat(amount) * 1e18)).toString();

        setLoading(true);
        chrome.runtime.sendMessage({ 
            type: 'RPC_REQUEST', 
            method: 'eth_sendTransaction',
            params: [{ to: recipient, value: val }]
        }, (res) => {
            setLoading(false);
            if (res.result) {
                setError("Transaction Sent!"); // Hijack error for success msg temporarily
                setTimeout(() => {
                    setView('main');
                    setError(null);
                    setAmount('');
                    setRecipient('');
                    refreshData();
                }, 1500);
            } else {
                setError(res.error || "Transaction Failed");
            }
        });
    };

    const handleSaveSettings = () => {
        const newSettings = {
            rpcUrl: rpcUrl,
            chainId: parseInt(chainId) || 1337
        };
        chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings: newSettings }, () => {
            checkStatus(); // Reloads settings into state
            setView('main');
        });
    };

    const openSettings = () => {
        if (status) {
            setRpcUrl(status.settings.rpcUrl);
            setChainId(status.settings.chainId.toString());
            setView('settings');
        }
    };

    if (view === 'loading') return <div style={styles.container}><div style={{padding: 20}}>Loading...</div></div>;

    if (view === 'create') {
        return (
            <div style={styles.container}>
                <div style={styles.header}><h1 style={styles.title}>Create Wallet</h1></div>
                <div style={styles.content}>
                    <p style={{color: '#94a3b8', fontSize: '13px', marginBottom: '20px'}}>
                        Set a secure password to encrypt your post-quantum keys.
                    </p>
                    <span style={styles.label}>New Password</span>
                    <input type="password" style={styles.input} value={password} onChange={e => setPassword(e.target.value)} />
                    
                    <span style={styles.label}>Confirm Password</span>
                    <input type="password" style={styles.input} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />

                    {error && <div style={styles.error}>{error}</div>}

                    <div style={{marginTop: 'auto'}}>
                        <button style={styles.button} onClick={handleCreate} disabled={loading}>
                            {loading ? "Generating..." : "Create Wallet"}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (view === 'unlock') {
        return (
            <div style={styles.container}>
                <div style={styles.header}><h1 style={styles.title}>Unlock Wallet</h1></div>
                <div style={styles.content}>
                    <div style={{textAlign: 'center', marginBottom: '30px', marginTop: '40px'}}>
                        <div style={{fontSize: '40px'}}>🔒</div>
                    </div>
                    <span style={styles.label}>Password</span>
                    <input type="password" style={styles.input} value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleUnlock()} />

                    {error && <div style={styles.error}>{error}</div>}

                    <button style={styles.button} onClick={handleUnlock} disabled={loading}>
                        {loading ? "Unlocking..." : "Unlock"}
                    </button>
                    
                    <p style={{textAlign: 'center', fontSize: '12px', color: '#64748b', marginTop: '20px'}}>
                        Po8 Lattice Cryptography
                    </p>
                </div>
            </div>
        );
    }

    if (view === 'settings') {
        return (
            <div style={styles.container}>
                <div style={styles.header}>
                    <h1 style={styles.title}>Settings</h1>
                    <button onClick={() => setView('main')} style={{background:'none', border:'none', color:'#fff', cursor:'pointer'}}>✕</button>
                </div>
                <div style={styles.content}>
                    <span style={styles.label}>RPC URL</span>
                    <input style={styles.input} value={rpcUrl} onChange={e => setRpcUrl(e.target.value)} />

                    <span style={styles.label}>Chain ID</span>
                    <input style={styles.input} value={chainId} onChange={e => setChainId(e.target.value)} />

                    <button style={styles.button} onClick={handleSaveSettings}>Save</button>
                </div>
            </div>
        );
    }

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <h1 style={styles.title}>Po8 Network</h1>
                <div style={{display:'flex', gap:'10px', alignItems:'center'}}>
                    <div style={styles.networkBadge} onClick={openSettings}>
                        {status?.settings.chainId === 1337 ? 'Dev' : status?.settings.chainId === 8 ? 'Main' : 'Custom'}
                    </div>
                    <button onClick={handleLock} style={{background:'none', border:'none', cursor:'pointer', fontSize:'16px'}}>🔒</button>
                </div>
            </div>

            {view === 'main' && (
                <div style={styles.content}>
                    <div style={{textAlign: 'center', marginBottom: '30px'}}>
                        <span style={styles.label}>Total Balance</span>
                        <div style={styles.balance}>
                            {balance}<span style={styles.balanceLabel}>PO8</span>
                        </div>
                    </div>

                    <div style={styles.card}>
                        <span style={styles.label}>Your Address</span>
                        <div style={styles.value}>
                            {status?.address?.slice(0, 10)}...{status?.address?.slice(-8)}
                        </div>
                    </div>

                    <div style={{marginTop: 'auto'}}>
                        <button style={styles.button} onClick={() => setView('send')}>Send</button>
                        <button style={styles.secondaryButton} onClick={() => setView('receive')}>Receive</button>
                    </div>
                </div>
            )}

            {view === 'send' && (
                <div style={styles.content}>
                     <div style={{marginBottom: '20px'}}>
                        <button onClick={() => setView('main')} style={{background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0}}>← Back</button>
                        <h2 style={{margin: '10px 0 0 0', fontSize: '20px'}}>Send PO8</h2>
                    </div>
                    <span style={styles.label}>Recipient</span>
                    <input style={styles.input} placeholder="0x..." value={recipient} onChange={e => setRecipient(e.target.value)} />
                    <span style={styles.label}>Amount</span>
                    <input style={styles.input} type="number" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} />
                    
                    {error && <div style={{...styles.error, color: error.includes("Sent") ? '#22c55e' : '#ef4444'}}>{error}</div>}
                    
                    <button style={styles.button} onClick={handleSend} disabled={loading}>{loading ? "Signing..." : "Send"}</button>
                </div>
            )}

            {view === 'receive' && (
                <div style={{...styles.content, alignItems: 'center'}}>
                    <div style={{width:'100%', marginBottom: '20px'}}>
                        <button onClick={() => setView('main')} style={{background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0}}>← Back</button>
                    </div>
                    <div style={{backgroundColor: 'white', padding: '16px', borderRadius: '12px', marginBottom: '20px'}}>
                        <QRCode value={status?.address || ''} size={200} />
                    </div>
                    <div style={styles.value}>{status?.address}</div>
                </div>
            )}
        </div>
    );
}

const rootElement = document.getElementById('root');
if (rootElement) {
    ReactDOM.createRoot(rootElement).render(
      <React.StrictMode>
        <Popup />
      </React.StrictMode>
    );
}
