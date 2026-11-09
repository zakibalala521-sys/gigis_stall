import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown,
  Check,
  CircleUserRound,
  ClipboardList,
  Eye,
  EyeOff,
  LayoutDashboard,
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
const currentYear = new Date().getFullYear()

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
  const [scrolled, setScrolled] = useState(false)
  const [trayClosing, setTrayClosing] = useState(false)
  const [justAdded, setJustAdded] = useState(null)
  const justAddedTimer = useRef(0)

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 8)
      document.documentElement.style.setProperty('--sy', Math.min(window.scrollY, 1200))
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [view])

  const closeTray = () => {
    if (!trayOpen || trayClosing) return
    setTrayClosing(true)
    window.setTimeout(() => {
      setTrayOpen(false)
      setTrayClosing(false)
    }, 280)
  }

  useEffect(() => {
    if (!trayOpen) return undefined
    document.body.classList.add('scroll-locked')
    const onKey = (event) => { if (event.key === 'Escape') closeTray() }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.classList.remove('scroll-locked')
      window.removeEventListener('keydown', onKey)
    }
  })

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

  useEffect(() => {
    const targets = document.querySelectorAll('[data-reveal]:not([data-shown])')
    if (!('IntersectionObserver' in window)) {
      targets.forEach((element) => { element.dataset.shown = '' })
      return undefined
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return
        entry.target.dataset.shown = ''
        observer.unobserve(entry.target)
      })
    }, { rootMargin: '0px 0px -8% 0px', threshold: .08 })
    targets.forEach((element) => observer.observe(element))
    return () => observer.disconnect()
  }, [view, visibleProducts, user])

  const addToTray = (product) => {
    updateCart(product, 1)
    setJustAdded(product.product_id)
    window.clearTimeout(justAddedTimer.current)
    justAddedTimer.current = window.setTimeout(() => setJustAdded(null), 1100)
  }

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
      <header className={`site-header${scrolled ? ' is-scrolled' : ''}`}>
        <div className="header-inner">
        <a className="brand" href="#menu" onClick={() => setView('catalog')}>
          <span className="brand-mark" aria-hidden="true">G</span>
          <span className="brand-text"><strong>Gigi&apos;s</strong><small>Food House</small></span>
        </a>
        <nav className="site-nav" aria-label="Main navigation">
          <button className={`nav-link${view === 'catalog' ? ' active' : ''}`} type="button" onClick={() => setView('catalog')}><Utensils size={15} />Menu</button>
          {user ? <>
            {user.role === 'owner' && <>
              <button className={`nav-link${view === 'admin' ? ' active' : ''}`} type="button" onClick={() => setView('admin')}><LayoutDashboard size={15} />Dashboard</button>
              <button className={`nav-link${view === 'admin-history' ? ' active' : ''}`} type="button" onClick={() => setView('admin-history')}><ClipboardList size={15} />Order history</button>
              <button className={`nav-link${view === 'manage-menu' ? ' active' : ''}`} type="button" onClick={() => setView('manage-menu')}><PanelsTopLeft size={15} />Menu manager</button>
            </>}
            {user.role === 'customer' && <>
              <button className={`nav-link${view === 'customer-orders' ? ' active' : ''}`} type="button" onClick={() => setView('customer-orders')}><ClipboardList size={15} />My orders</button>
              <button className={`nav-link${view === 'customer-history' ? ' active' : ''}`} type="button" onClick={() => setView('customer-history')}><ClipboardList size={15} />History</button>
            </>}
            <button className={`nav-link${view === 'account' ? ' active' : ''}`} type="button" onClick={() => { setCurrentPassword(''); setNewPassword(''); setNewPasswordConfirmation(''); setAuthError(''); setAuthNotice(''); setView('account') }}><CircleUserRound size={15} />Account</button>
            <button className="nav-link" type="button" onClick={signOut}><LogOut size={15} />Sign out</button>
          </> : <button className={`nav-link${view === 'auth' ? ' active' : ''}`} type="button" onClick={() => { setAuthError(''); setAuthNotice(''); setAuthMode('signin'); setView('auth') }}><LogIn size={15} />Sign in</button>}
        </nav>
        {sessionChecked && canOrder && <button className="tray-link" type="button" onClick={() => setTrayOpen(true)} aria-label={`Open your tray, ${cartCount} items`}>
          <ShoppingBasket size={17} /><span className="tray-label">Your tray</span> <span className={`tray-count${cartCount ? ' bump' : ''}`} key={cartCount}>{cartCount}</span>
        </button>}
        </div>
      </header>

      <main className="view" key={view}>
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
          <div className="hero-inner">
          <div className="hero-copy">
            <p className="hero-kicker">{user?.role === 'customer' ? `Hey ${user.full_name.split(' ')[0]}, welcome back!` : 'Hello, gutom ka na?'}</p>
            <h1><span>Lutong</span> <span>bahay,</span> <span className="hl">sulit sa</span> <span className="hl">presyo.</span></h1>
            <p className="hero-text">{user?.role === 'customer' ? 'The kitchen is open. Pick your favorites, place your order, and we’ll have it ready when you get here.' : 'Siomai, chicken pastil, waffles and all your merienda favorites, hot from Gigi’s kitchen and easy on the baon.'}</p>
            <div className="hero-actions">
              <a className="button button-yellow" href="#menu">See the menu <ArrowDown size={18} /></a>
              <span className="hero-meta">Take-out · Cash on pick-up</span>
            </div>
          </div>
          <div className="hero-visual">
            <figure className="polaroid p1"><img src="/menu/waffle.jpg" alt="Freshly made waffles" /><figcaption>waffles!</figcaption></figure>
            <figure className="polaroid p2"><img src="/menu/siomai-new.jpg" alt="Steamed siomai" /><figcaption>siomai</figcaption></figure>
            <figure className="polaroid p3"><img src="/menu/banana-cue.jpg" alt="Banana cue on sticks" /><figcaption>banana cue</figcaption></figure>
            <svg className="spin-badge" viewBox="0 0 140 140" aria-hidden="true">
              <defs><path id="badge-path" d="M70,70 m-52,0 a52,52 0 1,1 104,0 a52,52 0 1,1 -104,0" /></defs>
              <circle cx="70" cy="70" r="68" />
              <text><textPath href="#badge-path" textLength="322" lengthAdjust="spacing">FRESH DAILY ★ LUTONG BAHAY ★ GIGI&apos;S ★</textPath></text>
              <text className="badge-center" x="70" y="84" textAnchor="middle">G</text>
            </svg>
            {products.length > 0 && <div className="hero-card">
              <div className="hero-card-head"><h3>Today&apos;s picks</h3><span>{products.length} on the menu</span></div>
              <ul className="banner-menu">
                {products.slice(0, 4).map((product) => (
                  <li key={product.product_id}>
                    <img src={imageFor(product)} alt="" />
                    <span>{product.name}</span>
                    <strong>₱{Number(product.price).toFixed(0)}</strong>
                    {sessionChecked && canOrder && product.is_available === 1 && <button className={`banner-add${justAdded === product.product_id ? ' is-added' : ''}`} type="button" onClick={() => addToTray(product)} aria-label={`Add ${product.name} to tray`}>{justAdded === product.product_id ? <Check size={15} /> : <Plus size={15} />}</button>}
                  </li>
                ))}
              </ul>
            </div>}
          </div>
          </div>
        </section>

        {products.length > 0 && <div className="marquee-wrap" aria-hidden="true">
          <div className="marquee marquee-back"><div className="marquee-track reverse">
            {[0, 1].map((copy) => products.map((product) => <span key={`${copy}-${product.product_id}`}>{product.name}</span>))}
          </div></div>
          <div className="marquee marquee-front"><div className="marquee-track">
            {[0, 1].map((copy) => products.map((product) => <span key={`${copy}-${product.product_id}`}>{product.name}</span>))}
          </div></div>
        </div>}

        <section className="menu-section" id="menu">
          <div className="section-heading" data-reveal>
            <div><p className="eyebrow">The menu</p><h2>Made fresh <i>every single day!</i></h2></div>
            <div className="menu-tools"><p>Rice meals, merienda and palamig, all priced for everyday.</p><label className="search-box"><Search size={17} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the menu" aria-label="Search the menu" /></label></div>
          </div>
          <div className="menu-filters">
            <div className="category-nav" aria-label="Menu categories">
              {categories.map((item) => <button className={category === item ? 'active' : ''} key={item} onClick={() => setCategory(item)}>{item}</button>)}
            </div>
            <p className="menu-count"><strong>{visibleProducts.length}</strong> of {products.length} dishes</p>
          </div>
          {error && <p className="error">{error}</p>}
          {!error && products.length === 0 && <div className="product-grid" aria-label="Loading the menu">
            {[0, 1, 2].map((item) => <div className="product-card skeleton-card" key={item}><div className="product-image" /><div className="skeleton-line" /><div className="skeleton-line short" /></div>)}
          </div>}
          {products.length > 0 && visibleProducts.length === 0 && <p className="empty-state">Nothing matches “{query}”. Try another dish or category.</p>}
          <div className="product-grid" key={category}>
            {visibleProducts.map((product, index) => (
              <article className={`product-card${product.is_available ? '' : ' is-sold-out'}`} key={product.product_id} data-reveal style={{ '--i': index % 3 }}>
                <div className="product-image"><img src={imageFor(product)} alt={product.name} loading="lazy" /><span>{product.categories?.name || 'Menu item'}</span>{!product.is_available && <strong className="sold-out-badge">Sold out</strong>}<strong className="price-sticker"><small>₱</small>{Number(product.price).toFixed(0)}</strong></div>
                <div className="product-info">
                  <div className="product-title"><h3>{product.name}</h3></div>
                  <p>{product.description || 'Made fresh for you.'}</p>
                  {sessionChecked && canOrder && product.is_available === 1 && <div className="product-buy"><button className={`add-button${justAdded === product.product_id ? ' is-added' : ''}`} onClick={() => addToTray(product)} aria-label={`Add ${product.name} to tray`}>{justAdded === product.product_id ? <><Check size={16} />Added</> : <><Plus size={16} />Add to tray</>}</button></div>}
                </div>
              </article>
            ))}
          </div>
        </section>
          </>
        )}
      </main>

      <footer className="site-footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <p className="footer-hand">Kain na!</p>
            <p>Lutong bahay, served with a smile. Order ahead and pick it up hot from the counter.</p>
            <a className="button button-yellow" href="#menu" onClick={() => setView('catalog')}>Order now <span>→</span></a>
          </div>
          <div className="footer-meta">
            <strong>Take-out only</strong>
            <span>Cash on pick-up</span>
          </div>
        </div>
        <p className="footer-giant" aria-hidden="true">GIGI&apos;S</p>
        <div className="footer-bottom"><span>© {currentYear} Gigi&apos;s Food House</span><span>Made fresh, every day.</span></div>
      </footer>

      {trayOpen && canOrder && <div className={`modal-backdrop${trayClosing ? ' is-closing' : ''}`} onClick={closeTray}><aside className="tray-panel" role="dialog" aria-modal="true" aria-label="Your tray" onClick={(event) => event.stopPropagation()}><div className="tray-header"><div><p className="eyebrow">Your order</p><h2>Your tray</h2></div><button className="close-button" onClick={closeTray} aria-label="Close tray"><X size={20} /></button></div>{cart.length === 0 ? <div className="empty-panel"><ShoppingBasket size={40} strokeWidth={1.5} /><p>Your tray is empty.<br />Add something delicious from the menu.</p><button className="button button-ghost" type="button" onClick={closeTray}>Browse the menu</button></div> : <>{cart.map((item) => <div className="tray-item" key={item.product_id}><img src={imageFor(item)} alt="" /><div><strong>{item.name}</strong><p>₱{Number(item.price).toFixed(2)}</p></div><div className="quantity"><button onClick={() => updateCart(item, -1)} aria-label={`Remove one ${item.name}`}><Minus size={14} /></button><span>{item.quantity}</span><button onClick={() => updateCart(item, 1)} aria-label={`Add one ${item.name}`}><Plus size={14} /></button></div></div>)}<div className="tray-total"><span>Total</span><strong>₱{cartTotal.toFixed(2)}</strong></div>{user?.role === 'customer' && <div className="checkout-fields"><p className="order-payment-note">Take-out · Cash on Pick-up</p><label>Order notes<input maxLength="255" value={orderNotes} onChange={(event) => setOrderNotes(event.target.value)} placeholder="Optional order note" /></label></div>}{authError && <p className="auth-error" role="alert">{authError}</p>}<button className="button button-dark full checkout-button" type="button" disabled={orderSubmitting} onClick={placeOrder}>{orderSubmitting ? 'Placing order…' : user?.role === 'customer' ? 'Place order' : 'Sign in to checkout'} <span>→</span></button></>}</aside></div>}
    </>
  )
}

export default App
