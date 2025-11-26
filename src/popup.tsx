import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import QRCode from "react-qr-code";

interface WalletResponse {
    success: boolean;
    publicKey?: number[];
    signature?: number[];
    balance?: string;
    history?: Transaction[];
    networkId?: number;
    fees?: FeeEstimates;
    error?: string;
}

interface FeeEstimates {
    base_fee: string;
    priority_fee: string;
    estimated_cost: string;
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
        backgroundColor: '#0f172a', // Slate 900
        color: '#e2e8f0', // Slate 200
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
        color: '#38bdf8', // Sky 400
    },
    networkBadge: {
        fontSize: '10px',
        padding: '4px 8px',
        borderRadius: '12px',
        backgroundColor: '#1e293b',
        color: '#94a3b8',
        fontWeight: 600,
        border: '1px solid #334155'
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
    feeRow: {
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '12px',
        color: '#94a3b8',
        marginTop: '10px',
        paddingTop: '10px',
        borderTop: '1px solid #334155'
    }
};

function Popup() {
  const [address, setAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState<string>('0');
  const [history, setHistory] = useState<Transaction[]>([]);
  const [networkId, setNetworkId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'main' | 'send' | 'receive'>('main');
  
  // Send Form State
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [fee] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);

  // Initial load: Check wallet
  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_ACCOUNT' }, (response: any) => {
        if (response && response.address) {
            setAddress(response.address);
            refreshData();
        } else {
            // Check if we need to create one (handled by UI button)
        }
    });
  }, []);

  const createWallet = () => {
    setLoading(true);
    chrome.runtime.sendMessage({ type: 'CREATE_ACCOUNT' }, (response: any) => {
        setLoading(false);
        if (response && response.success && response.address) {
            setAddress(response.address);
            refreshData();
        }
    });
  };

  const refreshData = () => {
      chrome.runtime.sendMessage({ type: 'GET_BALANCE' }, (res: WalletResponse) => {
          if (res && res.success && res.balance) setBalance(res.balance);
      });
      chrome.runtime.sendMessage({ type: 'GET_NETWORK' }, (res: WalletResponse) => {
          if (res && res.success && res.networkId) setNetworkId(res.networkId);
      });
      chrome.runtime.sendMessage({ type: 'GET_HISTORY' }, (res: WalletResponse) => {
          if (res && res.success && res.history) setHistory(res.history);
      });
  }

  const handleSend = async () => {
      if (!recipient || !amount) {
          setStatus("Please fill in all fields");
          return;
      }

      setLoading(true);
      setStatus("Signing with ML-DSA (Quantum Safe)...");

      // Use RPC method via generic messaging
      chrome.runtime.sendMessage({ 
          type: 'RPC_REQUEST', 
          method: 'eth_sendTransaction',
          params: [{ to: recipient, value: amount }]
      }, (response: any) => {
          setLoading(false);
          if (response && response.result) {
              setStatus("Transaction Sent!");
              setTimeout(() => {
                  setView('main');
                  setStatus(null);
                  setRecipient('');
                  setAmount('');
                  refreshData(); 
              }, 1500);
          } else {
              setStatus(response.error || "Transaction Failed");
          }
      });
  };

  const copyToClipboard = () => {
      if (address) {
          navigator.clipboard.writeText(address);
          setCopyFeedback(true);
          setTimeout(() => setCopyFeedback(false), 2000);
      }
  };

  const getNetworkName = (id: number | null) => {
      if (!id) return 'Connecting...';
      if (id === 1337) return 'Development';
      if (id === 80001) return 'Testnet';
      if (id === 8) return 'Mainnet';
      return `Chain ${id}`;
  }

  if (!address) {
      return (
          <div style={styles.container}>
              <div style={styles.header}>
                  <h1 style={styles.title}>Po8 Network</h1>
              </div>
              <div style={{...styles.content, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center'}}>
                  <div style={{marginBottom: '20px', textAlign: 'center', color: '#94a3b8'}}>
                      <p>Welcome to the Post-Quantum Era.</p>
                  </div>
                  <button 
                    onClick={createWallet} 
                    disabled={loading}
                    style={styles.button}>
                    {loading ? "Generating Lattice Keys..." : "Create New Wallet"}
                  </button>
              </div>
          </div>
      );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Po8 Network</h1>
        <div style={styles.networkBadge}>{getNetworkName(networkId)}</div>
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
                    {address.slice(0, 10)}...{address.slice(-8)}
                </div>
            </div>

            <div style={{flex: 1, overflowY: 'auto', marginBottom: '20px'}}>
                <span style={styles.label}>Recent Activity</span>
                {history.length === 0 ? (
                    <div style={{color: '#64748b', fontSize: '13px', textAlign: 'center', marginTop: '20px'}}>
                        No transactions yet
                    </div>
                ) : (
                    history.map((tx, i) => (
                        <div key={i} style={styles.txItem}>
                            <div>
                                <div style={styles.txHash}>Sent to {tx.recipient.slice(0, 6)}...</div>
                                <div style={styles.txMeta}>{new Date(tx.timestamp * 1000).toLocaleTimeString()}</div>
                            </div>
                            <div style={styles.txAmount}>-{tx.amount} PO8</div>
                        </div>
                    )).reverse()
                )}
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
                <button 
                    onClick={() => setView('main')}
                    style={{background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0, fontSize: '14px'}}>
                    ← Back
                </button>
                <h2 style={{margin: '10px 0 0 0', fontSize: '20px'}}>Send PO8</h2>
            </div>

            <div>
                <span style={styles.label}>Recipient Address</span>
                <input 
                    style={styles.input} 
                    placeholder="0x..." 
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                />

                <span style={styles.label}>Amount</span>
                <input 
                    style={styles.input} 
                    type="number" 
                    placeholder="0.00" 
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                />
            </div>

            {fee && (
                <div style={styles.feeRow}>
                    <span>Network Fee (Estimated)</span>
                    <span>{fee} PO8</span>
                </div>
            )}
            {fee && amount && (
                <div style={{...styles.feeRow, borderTop: 'none', color: '#f8fafc', fontWeight: 600}}>
                    <span>Total Cost</span>
                    <span>{(parseFloat(amount) + parseFloat(fee)).toFixed(4)} PO8</span>
                </div>
            )}

            {status && <div style={{...styles.error, color: status.includes("Sent") ? '#22c55e' : '#ef4444'}}>{status}</div>}

            <div style={{marginTop: '20px'}}>
                <button 
                    style={{...styles.button, opacity: loading ? 0.7 : 1}} 
                    onClick={handleSend}
                    disabled={loading}
                >
                    {loading ? "Signing..." : "Confirm Send"}
                </button>
            </div>
        </div>
      )}

      {view === 'receive' && (
        <div style={{...styles.content, display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
            <div style={{marginBottom: '20px', width: '100%'}}>
                <button 
                    onClick={() => setView('main')}
                    style={{background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0, fontSize: '14px'}}>
                    ← Back
                </button>
                <h2 style={{margin: '10px 0 0 0', fontSize: '20px'}}>Receive PO8</h2>
            </div>

            <div style={{backgroundColor: 'white', padding: '16px', borderRadius: '12px', marginBottom: '20px'}}>
                <QRCode value={address} size={200} />
            </div>

            <div style={{...styles.card, width: '100%', textAlign: 'center'}}>
                <span style={styles.label}>Your Address</span>
                <div style={{...styles.value, marginBottom: '12px', fontSize: '11px'}}>
                    {address}
                </div>
                <button 
                    onClick={copyToClipboard}
                    style={{...styles.button, padding: '8px', fontSize: '12px', background: copyFeedback ? '#22c55e' : '#334155'}}
                >
                    {copyFeedback ? "Copied!" : "Copy Address"}
                </button>
            </div>
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

