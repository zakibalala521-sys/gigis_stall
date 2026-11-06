import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import './OwnerDashboard.css'

const apiUrl = import.meta.env.VITE_API_URL || ''
const peso = (value) => `₱${Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const dateTime = (value) => new Date(value).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })

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

          <section className="dashboard-orders">
            <div className="dashboard-section-heading">
              <div><p className="eyebrow">Latest activity</p><h2>Recent orders</h2></div>
              <span>Showing {dashboard.recent_orders.length} of {dashboard.total_orders}</span>
            </div>
            {dashboard.recent_orders.length === 0 ? <p className="empty-state">There are no orders yet.</p> : (
              <div className="dashboard-table-wrap">
                <table className="dashboard-table">
                  <thead>
                    <tr><th>Order</th><th>Customer</th><th>Items</th><th>Type</th><th>Status</th><th>Total</th><th>Placed</th></tr>
                  </thead>
                  <tbody>
                    {dashboard.recent_orders.map((order) => (
                      <tr key={order.order_id}>
                        <td>#{order.order_id}</td>
                        <td>{order.customer_name || 'Customer'}</td>
                        <td>{order.item_count}</td>
                        <td>{order.order_type}</td>
                        <td><span className={`order-status status-${order.status}`}>{order.status}</span></td>
                        <td>{peso(order.total_amount)}</td>
                        <td>{dateTime(order.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </section>
  )
}

export default OwnerDashboard
