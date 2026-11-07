import { useEffect, useState } from 'react'
import OrderManager from './OrderManager'
import './OwnerDashboard.css'

const apiUrl = import.meta.env.VITE_API_URL || ''
const peso = (value) => `₱${Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

async function fetchDashboard() {
  const response = await fetch(`${apiUrl}/api/admin/dashboard`, { credentials: 'include' })
  const data = await response.json()
  if (!response.ok || !data.success) throw new Error(data.message || 'Could not load the owner dashboard.')
  return data.dashboard
}

function OwnerDashboard({ mode = 'active' }) {
  const [dashboard, setDashboard] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(mode !== 'history')

  useEffect(() => {
    if (mode === 'history') return undefined
    let active = true
    const load = () => fetchDashboard()
      .then((data) => { if (active) { setDashboard(data); setError('') } })
      .catch((requestError) => { if (active) setError(requestError.message) })
      .finally(() => { if (active) setLoading(false) })
    load()
    const timer = window.setInterval(load, 10000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [mode])

  return (
    <section className="owner-dashboard">
      <div className="admin-heading">
        <div>
          <p className="eyebrow">Back of house</p>
          <h1>{mode === 'history' ? <>Order<br /><i>history.</i></> : <>Your stall,<br /><i>at a glance.</i></>}</h1>
        </div>
      </div>

      {error && <p className="dashboard-error" role="alert">{error}</p>}
      {mode === 'history' ? <OrderManager mode="history" />
        : loading && !dashboard ? <p className="empty-state">Loading your dashboard...</p> : dashboard && (
        <>
          <div className="dashboard-stats">
            <article><span>Today&apos;s sales</span><strong>{peso(dashboard.today_sales)}</strong></article>
            <article><span>Open orders</span><strong>{dashboard.open_orders}</strong></article>
            <article><span>Total sales</span><strong>{peso(dashboard.total_sales)}</strong><small>{dashboard.total_orders} orders</small></article>
            <article><span>Pending vendors</span><strong>{dashboard.pending_vendors}</strong></article>
          </div>

          <OrderManager mode="active" />
        </>
      )}
    </section>
  )
}

export default OwnerDashboard
