import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, Eye, EyeOff, Minus, Plus, Search, X } from 'lucide-react'
import OwnerDashboard from './OwnerDashboard'
import './App.css'

const apiUrl = import.meta.env.VITE_API_URL || ''

const imageFor = (name) => {
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
  return `/menu/${imageNames[name] || 'placeholder.svg'}`
}

function App() {
  const [products, setProducts] = useState([])
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')
  const [cart, setCart] = useState([])
  const [error, setError] = useState('')
  const [trayOpen, setTrayOpen] = useState(false)
  const [view, setView] = useState('catalog')
  const [user, setUser] = useState(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)

  useEffect(() => {
    fetch(`${apiUrl}/api/menu`)
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok || !data.success) throw new Error(data.message || 'Could not load the menu.')
        return data
      })
      .then((data) => setProducts(data.products || []))
      .catch((requestError) => setError(requestError.message))
  }, [])

  useEffect(() => {
    fetch(`${apiUrl}/api/auth/session`, { credentials: 'include' })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok || !data.success) throw new Error(data.message || 'Could not verify the sign-in session.')
        if (data.authenticated) {
          setUser(data.user)
          if (data.user.role === 'owner') setView('admin')
        }
      })
      .catch((requestError) => console.error(requestError))
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

    try {
      const response = await fetch(`${apiUrl}/api/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.message || 'Could not sign in.')

      setUser(data.user)
      setPassword('')
      setView(data.user.role === 'owner' ? 'admin' : 'catalog')
    } catch (requestError) {
      setAuthError(requestError.message)
    } finally {
      setAuthLoading(false)
    }
  }

  const signOut = async () => {
    try {
      const response = await fetch(`${apiUrl}/api/auth/logout`, { method: 'POST', credentials: 'include' })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.message || 'Could not sign out.')
      setUser(null)
    } catch (requestError) {
      setAuthError(requestError.message)
      setView('auth')
    }
  }

  return (
    <>
      <header className="site-header">
        <a className="brand" href="#menu"><span className="brand-mark">G</span><span>Gigi&apos;s <em>Food</em> House</span></a>
        <nav className="site-nav" aria-label="Main navigation">
          <button className={view === 'catalog' ? 'active' : ''} type="button" onClick={() => setView('catalog')}>Menu</button>
          {user ? <>{user.role === 'owner' && <button className={view === 'admin' ? 'active' : ''} type="button" onClick={() => setView('admin')}>Dashboard</button>}<span className="account-name">{user.full_name}</span><button type="button" onClick={signOut}>Sign out</button></> : <button className={view === 'auth' ? 'active' : ''} type="button" onClick={() => { setAuthError(''); setView('auth') }}>Sign in</button>}
          <button className="tray-link" type="button" onClick={() => setTrayOpen(true)}>
            Your tray <span>{cartCount}</span>
          </button>
        </nav>
      </header>

      <main>
        {view === 'auth' ? (
          <section className="auth-page">
            <div className="auth-card">
              <p className="eyebrow">Welcome back</p>
              <h1>Good to see<br /><i>you again.</i></h1>
              <p className="auth-intro">Sign in to your Gigi&apos;s account.</p>
              <form className="auth-form" onSubmit={signIn}>
                <label htmlFor="login-email">Email</label>
                <input id="login-email" type="email" name="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" />
                <label htmlFor="login-password">Password</label>
                <div className="password-input-wrap">
                  <input id="login-password" type={passwordVisible ? 'text' : 'password'} name="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" />
                  <button className="password-toggle" type="button" onClick={() => setPasswordVisible((visible) => !visible)} aria-label={passwordVisible ? 'Hide password' : 'Show password'}>
                    {passwordVisible ? <EyeOff size={19} /> : <Eye size={19} />}
                  </button>
                </div>
                {authError && <p className="auth-error" role="alert">{authError}</p>}
                <button className="button button-dark auth-submit" type="submit" disabled={authLoading}>{authLoading ? 'Signing in...' : 'Sign in'} <span>→</span></button>
              </form>
              <p className="auth-note">Use the email and password for your verified Gigi&apos;s account.</p>
            </div>
          </section>
        ) : view === 'admin' && user?.role === 'owner' ? (
          <OwnerDashboard />
        ) : (
          <>
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">Welcome to</p>
            <h1>Gigi&apos;s<br /><i>Food House.</i></h1>
            <p className="hero-text">Gigi&apos;s little canteen serving siomai, chicken pastil, waffles and merienda favorites, hot from the kitchen and easy on the baon.</p>
            <a className="button button-dark" href="#menu">Explore the menu <ArrowDown size={16} /></a>
          </div>
          <div className="hero-banner">
            <div className="banner-top"><span>Now serving</span><span>Dine-in · Take-out · Delivery</span></div>
            <h2>Lutong bahay,<br /><i>sulit sa presyo.</i></h2>
            <ul className="banner-menu">
              {products.slice(0, 5).map((product) => (
                <li key={product.product_id}>
                  <img src={imageFor(product.name)} alt="" />
                  <span>{product.name}</span>
                  <strong>₱{Number(product.price).toFixed(0)}</strong>
                </li>
              ))}
            </ul>
            <div className="banner-foot"><span>Gigi&apos;s Food House</span><span>Fresh from the kitchen ↓</span></div>
          </div>
        </section>

        <section className="menu-section" id="menu">
          <div className="section-heading">
            <div><p className="eyebrow">The menu</p><h2>Made fresh.<br />Every day.</h2></div>
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
                <div className="product-image"><img src={imageFor(product.name)} alt={product.name} /><span>{product.categories?.name || 'Menu item'}</span></div>
                <div className="product-info"><div><h3>{product.name}</h3><p>{product.description || 'Made fresh for you.'}</p></div><div className="product-buy"><strong>₱{Number(product.price).toFixed(2)}</strong><button className="add-button" onClick={() => updateCart(product, 1)} aria-label={`Add ${product.name} to tray`}><Plus size={18} /></button></div></div>
              </article>
            ))}
          </div>
        </section>
          </>
        )}
      </main>

      <footer className="site-footer"><span>Gigi&apos;s Food House</span><span>Lutong bahay, served with a smile.</span></footer>

      {trayOpen && <div className="modal-backdrop" onClick={() => setTrayOpen(false)}><aside className="tray-panel" onClick={(event) => event.stopPropagation()}><div className="tray-header"><div><p className="eyebrow">Your order</p><h2>Your tray.</h2></div><button className="close-button" onClick={() => setTrayOpen(false)} aria-label="Close tray"><X /></button></div>{cart.length === 0 ? <p className="empty-panel">Your tray is empty. Add something delicious from the menu.</p> : <>{cart.map((item) => <div className="tray-item" key={item.product_id}><img src={imageFor(item.name)} alt="" /><div><strong>{item.name}</strong><p>₱{Number(item.price).toFixed(2)}</p></div><div className="quantity"><button onClick={() => updateCart(item, -1)} aria-label={`Remove one ${item.name}`}><Minus size={14} /></button><span>{item.quantity}</span><button onClick={() => updateCart(item, 1)} aria-label={`Add one ${item.name}`}><Plus size={14} /></button></div></div>)}<div className="tray-total"><span>Total</span><strong>₱{cartTotal.toFixed(2)}</strong></div><button className="button button-dark full" type="button">Continue to checkout <span>→</span></button></>}</aside></div>}
    </>
  )
}

export default App
