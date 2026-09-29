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
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');
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
        throw new Error(body.message || 'Demo login failed');
      }
      onLoginSuccess(body.data.business);
      onClose();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to login as demo merchant');
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
          throw new Error('Please enter both username and password');
        }
        // In local/demo mode, authenticates user by username or provisions session
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
          throw new Error(body.message || 'Login failed');
        }
        onLoginSuccess(body.data.business);
        onClose();
      } else {
        // Register new merchant account
        if (!businessName.trim()) {
          throw new Error('Please enter your business or store name');
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
          throw new Error(body.message || 'Account registration failed');
        }
        onLoginSuccess(body.data.business);
        onClose();
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Authentication failed');
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
            aria-label="Close authentication modal"
          >
            <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">
              <path d="M5 5L15 15M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <h2 id="auth-modal-title">
          {currentBusiness ? 'Switch Workspace / Account' : 'Merchant Login'}
        </h2>
        <p className="auth-modal-subtitle">
          Manage your sales ledger, live dashboards, and voice-assisted accounting.
        </p>

        {errorMessage && (
          <div className="home-dialog-error auth-error-alert" role="alert">
            {errorMessage}
          </div>
        )}

        {/* Option 1: 1-Click Demo Merchant Access (Hackathon Judge Flow) */}
        <section className="auth-demo-section" aria-label="Demo merchant quick access">
          <div className="auth-demo-badge">
            <span className="mode-pill mode-pill-demo">[DEMO DATA]</span>
            <span className="auth-demo-tag">Ready for Voice &amp; Ledger</span>
          </div>
          <div className="auth-demo-info">
            <strong>EasyLedger Juice Stall</strong>
            <small>IDR · 2 Sample Juices · Append-only ledger</small>
          </div>
          <button
            type="button"
            className="button button-action auth-demo-btn"
            onClick={handleDemoLogin}
            disabled={loading}
          >
            {loading ? 'Entering...' : 'Masuk sebagai Demo Merchant (1-Click) →'}
          </button>
        </section>

        <div className="auth-divider" role="separator">
          <span>atau masuk dengan akun</span>
        </div>

        {/* Tab switcher: Login vs Register */}
        <div className="auth-tabs" role="tablist" aria-label="Account options">
          <button
            type="button"
            className={`auth-tab-btn ${activeTab === 'login' ? 'auth-tab-active' : ''}`}
            onClick={() => setActiveTab('login')}
            role="tab"
            aria-selected={activeTab === 'login'}
          >
            Masuk Akun
          </button>
          <button
            type="button"
            className={`auth-tab-btn ${activeTab === 'register' ? 'auth-tab-active' : ''}`}
            onClick={() => setActiveTab('register')}
            role="tab"
            aria-selected={activeTab === 'register'}
          >
            Buka Gerai Baru
          </button>
        </div>

        {/* Form: Username & Password / New Merchant */}
        <form onSubmit={handleAccountSubmit} className="auth-form">
          {activeTab === 'login' ? (
            <>
              <label className="home-dialog-field">
                <span>Username atau Email</span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin@easyledger.local atau nama akun"
                  autoComplete="username"
                  required
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
            </>
          ) : (
            <>
              <label className="home-dialog-field">
                <span>Nama Usaha / Gerai</span>
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="contoh: Kopi Senja Cirebon"
                  required
                />
              </label>

              <label className="home-dialog-field">
                <span>Username Pemilik (Opsional)</span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="pemilik_toko"
                />
              </label>

              <label className="home-dialog-field">
                <span>Mata Uang Pembukuan</span>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as 'IDR' | 'USD')}
                >
                  <option value="IDR">IDR (Rupiah) — Standar Indonesia</option>
                  <option value="USD">USD (Dollar) — Cents</option>
                </select>
              </label>
            </>
          )}

          <div className="home-dialog-actions auth-actions">
            <button
              type="button"
              className="button button-outline"
              onClick={onClose}
              disabled={loading}
            >
              Batal
            </button>
            <button
              type="submit"
              className="button button-primary auth-submit-btn"
              disabled={loading}
            >
              {loading ? 'Memproses...' : activeTab === 'login' ? 'Masuk ke Akun' : 'Daftarkan Gerai'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
