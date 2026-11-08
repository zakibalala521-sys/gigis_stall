import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDown,
  CircleUserRound,
  ClipboardList,
  Eye,
  EyeOff,
  LayoutDashboard,
  Leaf,
  LogIn,
  LogOut,
  Mail,
  Minus,
  PanelsTopLeft,
  Plus,
  Search,
  ShieldCheck,
  ShoppingBasket,
  Utensils,
  UserRound,
  X,
} from 'lucide-react'
import MenuManager from './MenuManager'
import OwnerDashboard from './OwnerDashboard'
import CustomerOrders from './CustomerOrders'
import { apiFetch } from './api'
import { supabase } from './supabase'
import './App.css'

const apiUrl = import.meta.env.VITE_API_URL || ''

const imageFor = (product) => {
  if (product.image) {
    if (/^https?:\/\//i.test(product.image) || product.image.startsWith('/')) return product.image
    const filename = product.image.split(/[\\/]/).pop()
    if (filename) return `/menu/${encodeURIComponent(filename)}`
  }
  const imageNames = {
    'Banana Cue': 'banana-cue.jpg',
    'Chicken Pastil Rice': 'chicken-pastil-rice.jpg',
    'Chicken Pastil': 'chicken-pastil.jpg',
    'Dicket with Cheese': 'dicket-with-cheese-1793163998.jpg',
    'Kamote Cue': 'kamote-cue.jpg',
    'Sago Gulaman': 'sago-gulaman.jpg',
    Siomai: 'siomai-new.jpg',
    'Sunny Side Up': 'sunny-side-up.jpg',
    Waffle: 'waffle.jpg',
  }
  return `/menu/${imageNames[product.name] || 'placeholder.svg'}`
}

function App() {
  const [products, setProducts] = useState([])
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')
  const [cart, setCart] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('gigi-cart') || '[]')
      return Array.isArray(saved) ? saved.filter((item) => Number.isInteger(item.product_id) && Number.isInteger(item.quantity) && item.quantity > 0) : []
    } catch {
      return []
    }
  })
  const [error, setError] = useState('')
  const [trayOpen, setTrayOpen] = useState(false)
  const [view, setView] = useState('catalog')
  const [user, setUser] = useState(null)
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPasswordConfirmation, setNewPasswordConfirmation] = useState('')
  const [otpToken, setOtpToken] = useState('')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [authMode, setAuthMode] = useState('signin')
  const [resendSeconds, setResendSeconds] = useState(0)
  const [authError, setAuthError] = useState(supabase ? '' : 'Supabase Auth is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
  const [authNotice, setAuthNotice] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [sessionChecked, setSessionChecked] = useState(!supabase)
  const [catalogVersion, setCatalogVersion] = useState(0)
  const [orderNotes, setOrderNotes] = useState('')
  const [orderSubmitting, setOrderSubmitting] = useState(false)

  const syncProfile = async (session) => {
    if (!session?.access_token) {
      setUser(null)
      return null
    }
    const response = await fetch(`${apiUrl}/api/auth/session`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: 'no-store',
    })
    const data = await response.json()
    if (!response.ok || !data.success || !data.authenticated) {
      throw new Error(data.message || 'Could not load your account profile.')
    }
    setUser(data.user)
    if (data.user.role === 'owner') setView('admin')
    return data.user
  }

  useEffect(() => {
    localStorage.setItem('gigi-cart', JSON.stringify(cart))
  }, [cart])

  useEffect(() => {
    if (resendSeconds <= 0) return undefined
    const timer = window.setInterval(() => setResendSeconds((seconds) => Math.max(0, seconds - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [resendSeconds])

  useEffect(() => {
    fetch(`${apiUrl}/api/menu`)
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok || !data.success) throw new Error(data.message || 'Could not load the menu.')
        return data
      })
      .then((data) => {
        const menu = data.products || []
        const currentProducts = new Map(menu.map((product) => [product.product_id, product]))
        setProducts(menu)
        setCart((current) => current.map((item) => currentProducts.has(item.product_id)
          ? { ...currentProducts.get(item.product_id), quantity: item.quantity }
          : item))
      })
      .catch((requestError) => setError(requestError.message))
  }, [catalogVersion])

  useEffect(() => {
    let active = true
    if (!supabase) return undefined

    const syncSession = async (session) => {
      if (!session) {
        if (active) setUser(null)
        return
      }
      try {
        await syncProfile(session)
      } catch (requestError) {
        if (active) setAuthError(requestError.message)
      }
    }

    supabase.auth.getSession()
      .then(({ data, error: sessionError }) => {
        if (sessionError) throw sessionError
        return syncSession(data.session)
      })
      .catch((requestError) => { if (active) setAuthError(requestError.message) })
      .finally(() => { if (active) setSessionChecked(true) })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        setUser(null)
        return
      }
      if (session) window.setTimeout(() => { if (active) syncSession(session) }, 0)
    })
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const categories = useMemo(() => [
    'All',
    ...new Set(products.map((product) => product.categories?.name).filter(Boolean)),
  ], [products])

  const visibleProducts = useMemo(() => products.filter((product) => {
    const matchesCategory = category === 'All' || product.categories?.name === category
    const searchable = `${product.name} ${product.description || ''}`.toLowerCase()
    return matchesCategory && searchable.includes(query.toLowerCase())
  }), [category, products, query])

  const cartCount = cart.reduce((total, item) => total + item.quantity, 0)
  const cartTotal = cart.reduce((total, item) => total + Number(item.price) * item.quantity, 0)
  const canOrder = !user || user.role === 'customer'

  const updateCart = (product, change) => {
    setCart((current) => {
      const existing = current.find((item) => item.product_id === product.product_id)
      if (!existing && change > 0) return [...current, { ...product, quantity: 1 }]
      return current
        .map((item) => item.product_id === product.product_id
          ? { ...item, quantity: item.quantity + change } : item)
        .filter((item) => item.quantity > 0)
    })
  }

  const signIn = async (event) => {
    event.preventDefault()
    setAuthLoading(true)
    setAuthError('')
    setAuthNotice('')

    try {
      if (!supabase) throw new Error('Supabase Auth is not configured.')
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (signInError) throw signInError
      const profile = await syncProfile(data.session)
      if (!profile) throw new Error('Could not load your account profile.')
      setPassword('')
      setView(profile.role === 'owner' ? 'admin' : 'catalog')
      if (profile.role === 'customer' && cart.length > 0) setTrayOpen(true)
    } catch (requestError) {
      setAuthError(requestError.message)
    } finally {
      setAuthLoading(false)
    }
  }

  const register = async (event) => {
    event.preventDefault()
    setAuthLoading(true)
    setAuthError('')
    setAuthNotice('')

    if (!fullName.trim()) {
      setAuthError('Enter your full name.')
      setAuthLoading(false)
      return
    }
    if (password !== passwordConfirmation) {
      setAuthError('The passwords do not match.')
      setAuthLoading(false)
      return
    }
    if (password.length < 8 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      setAuthError('Use at least 8 characters, including uppercase, lowercase, a number, and a symbol.')
      setAuthLoading(false)
      return
    }

    try {
      if (!supabase) throw new Error('Supabase Auth is not configured.')
      const { data, error: signupError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: fullName.trim() } },
      })
      if (signupError) throw signupError
      setPassword('')
      setPasswordConfirmation('')
      if (data.session) {
        await syncProfile(data.session)
        setAuthMode('signin')
        setView('catalog')
        if (cart.length > 0) setTrayOpen(true)
      } else {
        setOtpToken('')
        setResendSeconds(60)
        setAuthMode('otp')
        setAuthNotice(`Enter the 6-digit code sent to ${email.trim()}.`)
      }
    } catch (requestError) {
      setAuthError(requestError.message)
    } finally {
      setAuthLoading(false)
    }
  }

  const verifyOtp = async (event) => {
    event.preventDefault()
    setAuthLoading(true)
    setAuthError('')
    try {
      if (!supabase) throw new Error('Supabase Auth is not configured.')
      const { data, error: verificationError } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otpToken.trim(),
        type: 'signup',
      })
      if (verificationError) throw verificationError
      if (!data.session) throw new Error('Code verified, but no authenticated session was returned.')
      const profile = await syncProfile(data.session)
      if (!profile) throw new Error('Could not load your account profile.')
      setAuthMode('signin')
      setAuthNotice('Your email is verified and your account is ready.')
      setView('catalog')
      if (cart.length > 0) setTrayOpen(true)
      setOtpToken('')
    } catch (requestError) {
      setAuthError(requestError.message)
    } finally {
      setAuthLoading(false)
    }
  }

  const resendOtp = async () => {
    if (resendSeconds > 0) return
    setAuthLoading(true)
    setAuthError('')
    try {
      if (!supabase) throw new Error('Supabase Auth is not configured.')
      const { error: resendError } = await supabase.auth.resend({ type: 'signup', email: email.trim() })
      if (resendError) throw resendError
      setResendSeconds(60)
      setAuthNotice(`A new 6-digit code was sent to ${email.trim()}.`)
    } catch (requestError) {
      setAuthError(requestError.message)
    } finally {
      setAuthLoading(false)
    }
  }

  const changePassword = async (event) => {
    event.preventDefault()
    setAuthLoading(true)
    setAuthError('')
    setAuthNotice('')

    if (newPassword !== newPasswordConfirmation) {
      setAuthError('The new passwords do not match.')
      setAuthLoading(false)
      return
    }
    if (newPassword.length < 8 || !/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/\d/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
      setAuthError('Use at least 8 characters, including uppercase, lowercase, a number, and a symbol.')
      setAuthLoading(false)
      return
    }

    try {
      if (!supabase || !user?.email) throw new Error('You must be signed in to change your password.')
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      })
      if (reauthError) throw new Error('Current password is incorrect.')

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
      if (updateError) throw updateError

      setCurrentPassword('')
      setNewPassword('')
      setNewPasswordConfirmation('')
      setAuthNotice('Your password has been changed.')
    } catch (requestError) {
      setAuthError(requestError.message)
    } finally {
      setAuthLoading(false)
    }
  }

  const signOut = async () => {
    try {
      if (!supabase) throw new Error('Supabase Auth is not configured.')
      const { error: signOutError } = await supabase.auth.signOut()
      if (signOutError) throw signOutError
      setUser(null)
      setTrayOpen(false)
      setView('catalog')
    } catch (requestError) {
      setAuthError(requestError.message)
      setView('auth')
    }
  }

  const placeOrder = async () => {
    if (!user || user.role !== 'customer') {
      setAuthMode('signin')
      setAuthError('')
      setAuthNotice('Sign in or create an account to place your order. Your cart will be saved.')
      setView('auth')
      setTrayOpen(false)
      return
    }
    if (cart.length === 0) return

    setOrderSubmitting(true)
    setAuthError('')
    try {
      const response = await apiFetch(`${apiUrl}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_type: 'take-out',
          notes: orderNotes,
          items: cart.map((item) => ({ product_id: item.product_id, quantity: item.quantity })),
        }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.message || 'Could not place your order.')
      setCart([])
      setOrderNotes('')
      setTrayOpen(false)
      setView('customer-orders')
    } catch (requestError) {
      setAuthError(requestError.message)
    } finally {
      setOrderSubmitting(false)
    }
  }

  return (
    <>
      <header className="site-header">
        <a className="brand" href="#menu"><span className="brand-mark"><Utensils size={18} strokeWidth={2.2} /></span><span>Gigi&apos;s <em>Food</em> House</span></a>
        <nav className="site-nav" aria-label="Main navigation">
          <button className={view === 'catalog' ? 'active' : ''} type="button" onClick={() => setView('catalog')}><Utensils size={15} />Menu</button>
          {user ? <>
            {user.role === 'owner' && <>
              <button className={view === 'admin' ? 'active' : ''} type="button" onClick={() => setView('admin')}><LayoutDashboard size={15} />Dashboard</button>
              <button className={view === 'admin-history' ? 'active' : ''} type="button" onClick={() => setView('admin-history')}><ClipboardList size={15} />Order History</button>
              <button className={view === 'manage-menu' ? 'active' : ''} type="button" onClick={() => setView('manage-menu')}><PanelsTopLeft size={15} />Menu manager</button>
            </>}
            {user.role === 'customer' && <>
              <button className={view === 'customer-orders' ? 'active' : ''} type="button" onClick={() => setView('customer-orders')}><ClipboardList size={15} />My Orders</button>
              <button className={view === 'customer-history' ? 'active' : ''} type="button" onClick={() => setView('customer-history')}><ClipboardList size={15} />Order History</button>
            </>}
            <button className={view === 'account' ? 'active' : ''} type="button" onClick={() => { setCurrentPassword(''); setNewPassword(''); setNewPasswordConfirmation(''); setAuthError(''); setAuthNotice(''); setView('account') }}><CircleUserRound size={15} />Me</button>
            <button type="button" onClick={signOut}><LogOut size={15} />Sign out</button>
          </> : <button className={view === 'auth' ? 'active' : ''} type="button" onClick={() => { setAuthError(''); setAuthNotice(''); setAuthMode('signin'); setView('auth') }}><LogIn size={15} />Sign in</button>}
          {sessionChecked && canOrder && <button className="tray-link" type="button" onClick={() => setTrayOpen(true)}>
            <ShoppingBasket size={16} />Your tray <span>{cartCount}</span>
          </button>}
        </nav>
      </header>

      <main>
        {view === 'account' && user ? (
          <section className="auth-page">
            <div className="auth-card">
              <p className="eyebrow"><CircleUserRound size={14} />My account</p>
              <h1>Your<br /><i>details.</i></h1>
              <dl className="account-details">
                <div><dt><UserRound size={14} />Name</dt><dd>{user.full_name}</dd></div>
                <div><dt><Mail size={14} />Email</dt><dd>{user.email}</dd></div>
                <div><dt><ShieldCheck size={14} />Account type</dt><dd>{user.role === 'owner' ? 'Owner' : 'Customer'}</dd></div>
              </dl>
              <h2 className="account-security-heading"><ShieldCheck size={23} />Change password</h2>
              <p className="auth-intro">Enter your current password and choose a new one. No email code is sent.</p>
              {authNotice && <p className="auth-notice" role="status">{authNotice}</p>}
              <form className="auth-form" onSubmit={changePassword}>
                <label htmlFor="current-password">Current password</label>
                <input id="current-password" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required autoComplete="current-password" />
                <label htmlFor="change-new-password">New password</label>
                <input id="change-new-password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required autoComplete="new-password" />
                <p className="password-requirements">At least 8 characters, including uppercase, lowercase, a number, and a symbol.</p>
                <label htmlFor="change-confirm-password">Confirm new password</label>
                <input id="change-confirm-password" type="password" value={newPasswordConfirmation} onChange={(event) => setNewPasswordConfirmation(event.target.value)} required autoComplete="new-password" />
                {authError && <p className="auth-error" role="alert">{authError}</p>}
                <button className="button button-dark auth-submit" type="submit" disabled={authLoading}>{authLoading ? 'Changing password...' : 'Change password'} <span>→</span></button>
              </form>
            </div>
          </section>
        ) : view === 'auth' ? (
          <section className="auth-page">
            <div className="auth-card">
              <p className="eyebrow">{authMode === 'signin' ? 'Welcome back' : authMode === 'signup' ? 'Join the canteen' : 'Email verification'}</p>
              <h1>{authMode === 'signin' ? <>Good to see<br /><i>you again.</i></> : authMode === 'signup' ? <>Create your<br /><i>account.</i></> : <>Check your<br /><i>email.</i></>}</h1>
              <p className="auth-intro">{authMode === 'signin' ? 'Sign in to your Gigi’s account.' : authMode === 'signup' ? 'Create a customer account to get started.' : 'Enter the 6-digit code we sent you.'}</p>
              {authNotice && <p className="auth-notice" role="status">{authNotice}</p>}
              {authMode === 'otp' ? (
                <form className="auth-form" onSubmit={verifyOtp}>
                  <label htmlFor="verification-code">6-digit code</label>
                  <input id="verification-code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength="6" value={otpToken} onChange={(event) => setOtpToken(event.target.value.replace(/\D/g, '').slice(0, 6))} required aria-label="6-digit verification code" />
                  {authError && <p className="auth-error" role="alert">{authError}</p>}
                  <button className="button button-dark auth-submit" type="submit" disabled={authLoading || otpToken.length !== 6}>{authLoading ? 'Verifying...' : 'Verify code'} <span>→</span></button>
                  <button className="auth-mode-toggle" type="button" disabled={authLoading || resendSeconds > 0} onClick={resendOtp}>
                    {resendSeconds > 0 ? `Resend code in ${resendSeconds}s` : 'Resend code'}
                  </button>
                </form>
              ) : (
                <form className="auth-form" onSubmit={authMode === 'signin' ? signIn : register}>
                {authMode === 'signup' && <>
                  <label htmlFor="register-name">Full name</label>
                  <input id="register-name" type="text" name="full_name" value={fullName} onChange={(event) => setFullName(event.target.value)} maxLength="100" required autoComplete="name" />
                </>}
                <label htmlFor="login-email">Email</label>
                <input id="login-email" type="email" name="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength="150" required autoComplete="email" />
                <label htmlFor="login-password">Password</label>
                <div className="password-input-wrap">
                  <input id="login-password" type={passwordVisible ? 'text' : 'password'} name="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'} />
                  <button className="password-toggle" type="button" onClick={() => setPasswordVisible((visible) => !visible)} aria-label={passwordVisible ? 'Hide password' : 'Show password'}>
                    {passwordVisible ? <EyeOff size={19} /> : <Eye size={19} />}
                  </button>
                </div>
                {authMode === 'signup' && <>
                  <p className="password-requirements">At least 8 characters, including uppercase, lowercase, a number, and a symbol.</p>
                  <label htmlFor="register-confirm-password">Confirm password</label>
                  <input id="register-confirm-password" type={passwordVisible ? 'text' : 'password'} name="confirm_password" value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} required autoComplete="new-password" />
                </>}
                {authError && <p className="auth-error" role="alert">{authError}</p>}
                <button className="button button-dark auth-submit" type="submit" disabled={authLoading}>{authLoading ? (authMode === 'signin' ? 'Signing in...' : 'Creating account...') : (authMode === 'signin' ? 'Sign in' : 'Create account')} <span>→</span></button>
                <button className="auth-mode-toggle" type="button" disabled={authLoading} onClick={() => { setAuthMode(authMode === 'signin' ? 'signup' : 'signin'); setAuthError(''); setAuthNotice('') }}>
                  {authMode === 'signin' ? 'New to Gigi’s? Create an account' : 'Already have an account? Sign in'}
                </button>
              </form>
              )}
              {authMode === 'signin' && <p className="auth-note">Sign in with the email and password you registered.</p>}
            </div>
          </section>
        ) : view === 'admin' && user?.role === 'owner' ? (
          <OwnerDashboard />
        ) : view === 'admin-history' && user?.role === 'owner' ? (
          <OwnerDashboard mode="history" />
        ) : view === 'manage-menu' && user?.role === 'owner' ? (
          <MenuManager onMenuChanged={() => setCatalogVersion((version) => version + 1)} />
        ) : view === 'customer-orders' && user?.role === 'customer' ? (
          <CustomerOrders mode="active" userId={user.user_id} />
        ) : view === 'customer-history' && user?.role === 'customer' ? (
          <CustomerOrders mode="history" userId={user.user_id} />
        ) : (
          <>
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow"><Leaf size={14} />{user?.role === 'customer' ? 'Welcome back' : 'Welcome to'}</p>
            <h1>{user?.role === 'customer' ? <>Good to see<br /><i>you again.</i></> : <>Gigi&apos;s<br /><i>Food House.</i></>}</h1>
            <p className="hero-text">{user?.role === 'customer' ? `Welcome back, ${user.full_name}. Browse the menu and see what you would like today.` : 'Gigi\'s little canteen serving siomai, chicken pastil, waffles and merienda favorites, hot from the kitchen and easy on the baon.'}</p>
            <a className="button button-dark" href="#menu">Explore the menu <ArrowDown size={16} /></a>
          </div>
          <div className="hero-banner">
            <div className="banner-top"><span><Leaf size={14} />Now serving</span><span>Take-out · Cash on Pick-up</span></div>
            <h2>Lutong bahay,<br /><i>sulit sa presyo.</i></h2>
            <ul className="banner-menu">
              {products.slice(0, 5).map((product) => (
                <li key={product.product_id}>
                  <img src={imageFor(product)} alt="" />
                  <span>{product.name}</span>
                  <strong>₱{Number(product.price).toFixed(0)}</strong>
                  {sessionChecked && canOrder && product.is_available === 1 && <button className="banner-add" type="button" onClick={() => updateCart(product, 1)} aria-label={`Add ${product.name} to tray`}><Plus size={16} /></button>}
                </li>
              ))}
            </ul>
            <div className="banner-foot"><span>Gigi&apos;s Food House</span><span>Fresh from the kitchen ↓</span></div>
          </div>
        </section>

        <section className="menu-section" id="menu">
          <div className="section-heading">
            <div><p className="eyebrow"><Utensils size={14} />The menu</p><h2>Made fresh.<br />Every day.</h2></div>
            <div className="menu-tools"><p>Rice meals, merienda and palamig, all priced for everyday.</p><label className="search-box"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the menu..." /></label></div>
          </div>
          <div className="category-nav" aria-label="Menu categories">
            {categories.map((item) => <button className={category === item ? 'active' : ''} key={item} onClick={() => setCategory(item)}>{item}</button>)}
          </div>
          {error && <p className="error">{error}</p>}
          {!error && products.length === 0 && <p className="empty-state">Loading the menu...</p>}
          <p className="menu-count">Showing <strong>{visibleProducts.length}</strong> of {products.length} items</p>
          <div className="product-grid">
            {visibleProducts.map((product) => (
              <article className="product-card" key={product.product_id}>
                <div className="product-image"><img src={imageFor(product)} alt={product.name} /><span>{product.categories?.name || 'Menu item'}</span>{!product.is_available && <strong className="sold-out-badge">Sold out</strong>}</div>
                <div className="product-info"><div><h3>{product.name}</h3><p>{product.description || 'Made fresh for you.'}</p></div><div className="product-buy"><strong>₱{Number(product.price).toFixed(2)}</strong>{sessionChecked && canOrder && product.is_available === 1 && <button className="add-button" onClick={() => updateCart(product, 1)} aria-label={`Add ${product.name} to tray`}><Plus size={18} /></button>}</div></div>
              </article>
            ))}
          </div>
        </section>
          </>
        )}
      </main>

      <footer className="site-footer"><span>Gigi&apos;s Food House</span><span>Lutong bahay, served with a smile.</span></footer>

      {trayOpen && canOrder && <div className="modal-backdrop" onClick={() => setTrayOpen(false)}><aside className="tray-panel" onClick={(event) => event.stopPropagation()}><div className="tray-header"><div><p className="eyebrow">Your order</p><h2>Your tray.</h2></div><button className="close-button" onClick={() => setTrayOpen(false)} aria-label="Close tray"><X /></button></div>{cart.length === 0 ? <p className="empty-panel">Your tray is empty. Add something delicious from the menu.</p> : <>{cart.map((item) => <div className="tray-item" key={item.product_id}><img src={imageFor(item)} alt="" /><div><strong>{item.name}</strong><p>₱{Number(item.price).toFixed(2)}</p></div><div className="quantity"><button onClick={() => updateCart(item, -1)} aria-label={`Remove one ${item.name}`}><Minus size={14} /></button><span>{item.quantity}</span><button onClick={() => updateCart(item, 1)} aria-label={`Add one ${item.name}`}><Plus size={14} /></button></div></div>)}<div className="tray-total"><span>Total</span><strong>₱{cartTotal.toFixed(2)}</strong></div>{user?.role === 'customer' && <div className="checkout-fields"><p className="order-payment-note">Take-out · Cash on Pick-up</p><label>Order notes<input maxLength="255" value={orderNotes} onChange={(event) => setOrderNotes(event.target.value)} placeholder="Optional order note" /></label></div>}{authError && <p className="auth-error" role="alert">{authError}</p>}<button className="button button-dark full checkout-button" type="button" disabled={orderSubmitting} onClick={placeOrder}>{orderSubmitting ? 'Placing order…' : user?.role === 'customer' ? 'Place order' : 'Sign in to checkout'} <span>→</span></button></>}</aside></div>}
    </>
  )
}

export default App
