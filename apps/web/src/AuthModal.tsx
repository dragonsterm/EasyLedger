import { useEffect, useState, type FormEvent } from 'react';
import { apiFetch } from './api';
import CustomSelect from './CustomSelect';

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

export type AuthTab = 'demo' | 'login' | 'register';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (business: MerchantIdentity) => void;
  onLogout: () => void;
  currentBusiness?: MerchantIdentity;
  initialTab?: AuthTab;
  isPage?: boolean;
  onModeChange?: (tab: AuthTab) => void;
  initialError?: string | null;
}

interface AuthResponse {
  data?: { business?: MerchantIdentity };
  message?: string;
}

async function submitAuth(path: string, payload: Record<string, unknown>): Promise<MerchantIdentity> {
  const response = await apiFetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => null) as AuthResponse | null;
  if (!response.ok) throw new Error(result?.message ?? `EasyLedger could not complete the request (${response.status}).`);
  if (!result?.data?.business) throw new Error('EasyLedger returned an incomplete account response.');
  return result.data.business;
}

export function AuthModal({
  isOpen,
  onClose,
  onLoginSuccess,
  onLogout,
  currentBusiness,
  initialTab = 'demo',
  isPage = false,
  onModeChange,
  initialError = null,
}: AuthModalProps) {
  const [activeTab, setActiveTab] = useState<AuthTab>(initialTab);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [currency, setCurrency] = useState<'IDR' | 'USD'>('IDR');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setActiveTab(initialTab);
    setErrorMessage(initialError);
  }, [initialError, initialTab, isOpen]);

  if (!isOpen) return null;

  const selectTab = (tab: AuthTab) => {
    setActiveTab(tab);
    setErrorMessage(null);
    onModeChange?.(tab);
  };

  const handleDemoLogin = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const business = await submitAuth('/api/v1/auth/login', { merchant: 'demo' });
      onLoginSuccess(business);
      onClose();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Demo sign in failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleAccountSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    try {
      const business = activeTab === 'login'
        ? await submitAuth('/api/v1/auth/login', {
            merchant: 'account',
            username: username.trim(),
            password,
          })
        : await submitAuth('/api/v1/auth/signup', {
            username: username.trim(),
            email: email.trim(),
            password,
            business_name: businessName.trim(),
            currency,
          });
      onLoginSuccess(business);
      onClose();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const response = await apiFetch('/api/v1/auth/logout', { method: 'POST' });
      const result = await response.json().catch(() => null) as AuthResponse | null;
      if (!response.ok) throw new Error(result?.message ?? `Sign out failed (${response.status}).`);
      onLogout();
      selectTab('demo');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Sign out failed.');
    } finally {
      setLoading(false);
    }
  };

  const closeAllowed = Boolean(currentBusiness) && !isPage;
  const content = (
    <section className="home-dialog auth-modal-dialog" aria-labelledby="auth-modal-title">
      <div className="auth-modal-header">
        <div className="rail-brand">
          <img className="rail-brand-icon" src="/assets/easyledger-icon.svg" alt="" aria-hidden="true" />
          <div className="rail-brand-copy">
            <strong>EasyLedger</strong>
            <span>Sales, made clear.</span>
          </div>
        </div>
        {closeAllowed && (
          <button type="button" className="inspector-close" onClick={onClose} aria-label="Close account switcher">
            <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">
              <path d="M5 5L15 15M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      {currentBusiness && (
        <div className="auth-current-account" aria-label="Current account">
          <span className="auth-current-account-name">{currentBusiness.name}</span>
          <span>{currentBusiness.is_demo ? 'DEMO DATA' : 'Private workspace'} · {currentBusiness.currency}</span>
          <button type="button" className="button button-outline auth-signout-btn" onClick={() => void handleLogout()} disabled={loading}>
            Sign out
          </button>
        </div>
      )}

      <h2 id="auth-modal-title">{currentBusiness ? 'Switch Workspace' : 'Choose your workspace'}</h2>
      <p className="auth-modal-subtitle">
        Sign in to your business, create a private ledger, or explore the labeled demo workspace.
      </p>

      {errorMessage && <div className="home-dialog-error auth-error-alert" role="alert">{errorMessage}</div>}

      <div className="auth-tabs" role="tablist" aria-label="Workspace options">
        <button type="button" className={`auth-tab-btn ${activeTab === 'demo' ? 'auth-tab-active' : ''}`} onClick={() => selectTab('demo')} role="tab" aria-selected={activeTab === 'demo'}>
          Demo data
        </button>
        <button type="button" className={`auth-tab-btn ${activeTab === 'login' ? 'auth-tab-active' : ''}`} onClick={() => selectTab('login')} role="tab" aria-selected={activeTab === 'login'}>
          Sign in
        </button>
        <button type="button" className={`auth-tab-btn ${activeTab === 'register' ? 'auth-tab-active' : ''}`} onClick={() => selectTab('register')} role="tab" aria-selected={activeTab === 'register'}>
          Create account
        </button>
      </div>

      {activeTab === 'demo' && (
        <div className="auth-demo-card">
          <div className="auth-demo-badge">
            <span className="mode-pill mode-pill-demo">DEMO DATA</span>
            <span className="auth-demo-tag">Seeded PostgreSQL workspace</span>
          </div>
          <div className="auth-demo-details">
            <strong>[DEMO] EasyLedger Juice Stall</strong>
            <p>Uses the shared demo business and its two seeded catalog items. Sales start empty; anything you record stays in this demo workspace.</p>
            <div className="auth-demo-meta-grid">
              <div><small>Currency</small><span>IDR (Rp)</span></div>
              <div><small>Catalog</small><span>Orange Juice · Mango Juice</span></div>
            </div>
            <div className="auth-demo-hint">
              <span className="auth-demo-hint-label">Try a voice entry</span>
              <code>“Record 3 orange juices at Rp 15,000 each today”</code>
            </div>
          </div>
          <button type="button" className="button button-action auth-demo-btn" onClick={() => void handleDemoLogin()} disabled={loading}>
            {loading ? 'Connecting…' : 'Open demo workspace'}
            <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">
              <path d="M4 10h11M10 5l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      )}

      {activeTab === 'login' && (
        <form onSubmit={handleAccountSubmit} className="auth-form">
          <label className="home-dialog-field">
            <span>Username or email</span>
            <input type="text" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="merchant@example.com" autoComplete="username" required autoFocus />
          </label>
          <label className="home-dialog-field">
            <span>Password</span>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
          </label>
          <div className="home-dialog-actions auth-actions">
            {closeAllowed && <button type="button" className="button button-outline" onClick={onClose} disabled={loading}>Cancel</button>}
            <button type="submit" className="button button-primary auth-submit-btn" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button>
          </div>
        </form>
      )}

      {activeTab === 'register' && (
        <form onSubmit={handleAccountSubmit} className="auth-form">
          <label className="home-dialog-field">
            <span>Username</span>
            <input type="text" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="alex_merchant" autoComplete="username" minLength={3} maxLength={32} pattern="[A-Za-z0-9][A-Za-z0-9_.-]{2,31}" required autoFocus />
          </label>
          <label className="home-dialog-field">
            <span>Email address</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="alex@example.com" autoComplete="email" maxLength={254} required />
          </label>
          <label className="home-dialog-field">
            <span>Password</span>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={10} maxLength={100} required />
            <small>Use at least 10 characters.</small>
          </label>
          <label className="home-dialog-field">
            <span>Business or store name</span>
            <input type="text" value={businessName} onChange={(event) => setBusinessName(event.target.value)} placeholder="Orchard Fresh Juices" maxLength={100} required />
          </label>
          <label className="home-dialog-field">
            <span>Business currency</span>
            <CustomSelect
              value={currency}
              onChange={(val) => setCurrency(val as 'IDR' | 'USD')}
              variant="form"
              ariaLabel="Business currency"
              options={[
                { value: 'IDR', label: 'IDR — Indonesian rupiah' },
                { value: 'USD', label: 'USD — US dollar' },
              ]}
            />
          </label>
          <div className="home-dialog-actions auth-actions">
            {closeAllowed && <button type="button" className="button button-outline" onClick={onClose} disabled={loading}>Cancel</button>}
            <button type="submit" className="button button-primary auth-submit-btn" disabled={loading}>{loading ? 'Creating account…' : 'Create account'}</button>
          </div>
        </form>
      )}
    </section>
  );

  if (isPage) return <main className="auth-modal-backdrop auth-modal-page">{content}</main>;
  return (
    <div className="home-dialog-backdrop auth-modal-backdrop" onClick={closeAllowed ? onClose : undefined} role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="auth-modal-title" onClick={(event) => event.stopPropagation()}>{content}</div>
    </div>
  );
}
