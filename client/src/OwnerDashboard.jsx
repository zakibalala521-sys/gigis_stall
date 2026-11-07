import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
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

function OwnerDashboard() {
  const [dashboard, setDashboard] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setDashboard(await fetchDashboard())
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    fetchDashboard()
      .then((data) => {
        if (active) setDashboard(data)
      })
      .catch((requestError) => {
        if (active) setError(requestError.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [])

  return (
    <section className="owner-dashboard">
      <div className="admin-heading">
        <div>
          <p className="eyebrow">Back of house</p>
          <h1>Your stall,<br /><i>at a glance.</i></h1>
        </div>
        <button className="button button-dark refresh-button" type="button" onClick={loadDashboard} disabled={loading}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      {error && <p className="dashboard-error" role="alert">{error}</p>}
      {loading && !dashboard ? <p className="empty-state">Loading your dashboard...</p> : dashboard && (
        <>
          <div className="dashboard-stats">
            <article><span>Today&apos;s sales</span><strong>{peso(dashboard.today_sales)}</strong></article>
            <article><span>Open orders</span><strong>{dashboard.open_orders}</strong></article>
            <article><span>Total sales</span><strong>{peso(dashboard.total_sales)}</strong><small>{dashboard.total_orders} orders</small></article>
            <article><span>Pending vendors</span><strong>{dashboard.pending_vendors}</strong></article>
          </div>

          <OrderManager />
        </>
      )}
    </section>
  )
}

export default OwnerDashboard
