import { useState, type FormEvent } from 'react';

export interface MerchantIdentity {
  id: string;
  name: string;
  currency: 'IDR' | 'USD';
  is_demo: boolean;
  ledger_revision: string;
}

export interface AuthSessionState {
  authenticated: boolean;
  userId?: string;
  business?: MerchantIdentity;
}

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (business: MerchantIdentity) => void;
  currentBusiness?: MerchantIdentity;
}

export function AuthModal({ isOpen, onClose, onLoginSuccess, currentBusiness }: AuthModalProps) {
  const [activeTab, setActiveTab] = useState<'demo' | 'login' | 'register'>('demo');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [currency, setCurrency] = useState<'IDR' | 'USD'>('IDR');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleDemoLogin = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchant: 'demo' }),
      });
      const body = await res.json();
      if (!res.ok || body.code) {
        throw new Error(body.message || 'Failed to initialize evaluation demo');
      }
      onLoginSuccess(body.data.business);
      onClose();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to launch demo workspace');
    } finally {
      setLoading(false);
    }
  };

  const handleAccountSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);

    try {
      if (activeTab === 'login') {
        if (!username.trim() || !password) {
          throw new Error('Please provide both username/email and password.');
        }
        const res = await fetch('/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            merchant: 'account',
            username: username.trim(),
            password,
          }),
        });
        const body = await res.json();
        if (!res.ok || body.code) {
          throw new Error(body.message || 'Authentication failed');
        }
        onLoginSuccess(body.data.business);
        onClose();
      } else if (activeTab === 'register') {
        if (!businessName.trim()) {
          throw new Error('Please enter your business or store name.');
        }
        const res = await fetch('/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            merchant: 'new',
            name: businessName.trim(),
            currency,
            username: username.trim() || undefined,
          }),
        });
        const body = await res.json();
        if (!res.ok || body.code) {
          throw new Error(body.message || 'Merchant registration failed');
        }
        onLoginSuccess(body.data.business);
        onClose();
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Authentication encountered an error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="home-dialog-backdrop auth-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="home-dialog auth-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="auth-modal-header">
          <div className="rail-brand">
            <strong>EasyLedger</strong>
            <span>Sales, made clear.</span>
          </div>
          <button
            type="button"
            className="inspector-close"
            onClick={onClose}
            aria-label="Close authentication dialog"
          >
            <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">
              <path d="M5 5L15 15M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <h2 id="auth-modal-title">
          {currentBusiness ? 'Switch Workspace' : 'Merchant Workspace'}
        </h2>
        <p className="auth-modal-subtitle">
          Access your sales journals, real-time analytics, and voice-assisted bookkeeping.
        </p>

        {errorMessage && (
          <div className="home-dialog-error auth-error-alert" role="alert">
            {errorMessage}
          </div>
        )}

        {/* Clean Segmented Tab Switcher */}
        <div className="auth-tabs" role="tablist" aria-label="Authentication modes">
          <button
            type="button"
            className={`auth-tab-btn ${activeTab === 'demo' ? 'auth-tab-active' : ''}`}
            onClick={() => setActiveTab('demo')}
            role="tab"
            aria-selected={activeTab === 'demo'}
          >
            Evaluation Demo
          </button>
          <button
            type="button"
            className={`auth-tab-btn ${activeTab === 'login' ? 'auth-tab-active' : ''}`}
            onClick={() => setActiveTab('login')}
            role="tab"
            aria-selected={activeTab === 'login'}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`auth-tab-btn ${activeTab === 'register' ? 'auth-tab-active' : ''}`}
            onClick={() => setActiveTab('register')}
            role="tab"
            aria-selected={activeTab === 'register'}
          >
            New Merchant
          </button>
        </div>

        {/* Tab 1: Hackathon Evaluation Demo (1-Click) */}
        {activeTab === 'demo' && (
          <div className="auth-demo-card">
            <div className="auth-demo-badge">
              <span className="mode-pill mode-pill-demo">EVALUATION FIXTURE</span>
              <span className="auth-demo-tag">AssemblyAI Voice Ready</span>
            </div>
            
            <div className="auth-demo-details">
              <strong>EasyLedger Juice Stall</strong>
              <p>Pre-configured merchant workspace with verified append-only ledger entries, catalog items, and live ECharts reconciliation.</p>
              
              <div className="auth-demo-meta-grid">
                <div>
                  <small>Currency</small>
                  <span>IDR (Indonesian Rupiah)</span>
                </div>
                <div>
                  <small>Catalog</small>
                  <span>Orange &amp; Mango Juices</span>
                </div>
              </div>

              <div className="auth-demo-hint">
                <span className="auth-demo-hint-label">Sample Voice Instruction:</span>
                <code>"Record sale of 3 orange juices at fifteen thousand rupiah"</code>
              </div>
            </div>

            <button
              type="button"
              className="button button-action auth-demo-btn"
              onClick={handleDemoLogin}
              disabled={loading}
            >
              {loading ? 'Entering...' : 'Launch Evaluation Demo →'}
            </button>
          </div>
        )}

        {/* Tab 2: Standard Sign In (Username & Password) */}
        {activeTab === 'login' && (
          <form onSubmit={handleAccountSubmit} className="auth-form">
            <label className="home-dialog-field">
              <span>Username or Email</span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="merchant@easyledger.local or username"
                autoComplete="username"
                required
                autoFocus
              />
            </label>

            <label className="home-dialog-field">
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </label>

            <div className="home-dialog-actions auth-actions">
              <button
                type="button"
                className="button button-outline"
                onClick={onClose}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="button button-primary auth-submit-btn"
                disabled={loading}
              >
                {loading ? 'Authenticating...' : 'Sign In to Workspace'}
              </button>
            </div>
          </form>
        )}

        {/* Tab 3: Register New Merchant Workspace */}
        {activeTab === 'register' && (
          <form onSubmit={handleAccountSubmit} className="auth-form">
            <label className="home-dialog-field">
              <span>Store / Business Name</span>
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="e.g. Orchard Fresh Juices"
                required
                autoFocus
              />
            </label>

            <label className="home-dialog-field">
              <span>Owner Username (Optional)</span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. alex_merchant"
              />
            </label>

            <label className="home-dialog-field">
              <span>Accounting Currency</span>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as 'IDR' | 'USD')}
              >
                <option value="IDR">IDR — Indonesian Rupiah</option>
                <option value="USD">USD — US Dollar</option>
              </select>
            </label>

            <div className="home-dialog-actions auth-actions">
              <button
                type="button"
                className="button button-outline"
                onClick={onClose}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="button button-primary auth-submit-btn"
                disabled={loading}
              >
                {loading ? 'Creating...' : 'Create Merchant Workspace'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
