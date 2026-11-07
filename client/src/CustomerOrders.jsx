import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'

const apiUrl = import.meta.env.VITE_API_URL || ''
const peso = (value) => `₱${Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const dateTime = (value) => new Date(value).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })

function CustomerOrders() {
  const [orders, setOrders] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [canceling, setCanceling] = useState(null)

  const loadOrders = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`${apiUrl}/api/orders`, { credentials: 'include' })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.message || 'Could not load your order history.')
      setOrders(data.orders)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    fetch(`${apiUrl}/api/orders`, { credentials: 'include' })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok || !data.success) throw new Error(data.message || 'Could not load your order history.')
        if (active) setOrders(data.orders)
      })
      .catch((requestError) => { if (active) setError(requestError.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const cancelOrder = async (orderId) => {
    setCanceling(orderId)
    setError('')
    try {
      const response = await fetch(`${apiUrl}/api/orders`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, action: 'cancel' }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.message || 'Could not cancel this order.')
      await loadOrders()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setCanceling(null)
    }
  }

  return (
    <section className="order-history-page">
      <div className="admin-heading">
        <div><p className="eyebrow">Your activity</p><h1>Order<br /><i>history.</i></h1></div>
        <button className="button button-dark refresh-button" type="button" onClick={loadOrders} disabled={loading}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>
      {error && <p className="dashboard-error" role="alert">{error}</p>}
      {loading && orders.length === 0 ? <p className="empty-state">Loading your orders...</p>
        : orders.length === 0 ? <p className="empty-state">You haven’t placed an order yet.</p>
          : <div className="customer-order-list">
            {orders.map((order) => (
              <article className="customer-order-card" key={`${order.order_id}-${order.archived ? 'history' : 'active'}`}>
                <div className="customer-order-heading">
                  <div><span className="eyebrow">Order #{order.order_id}</span><p>{dateTime(order.created_at)} · {order.order_type}</p></div>
                  <div className="customer-order-state">
                    <span className={`order-status status-${order.status.replaceAll(' ', '-')}`}>{order.status}</span>
                    {order.outcome && <strong className={`outcome-${order.outcome}`}>{order.outcome}</strong>}
                  </div>
                </div>
                <ul className="customer-order-items">
                  {order.items.map((item, index) => (
                    <li key={item.order_item_id || `${order.order_id}-${item.product_id}-${index}`}>
                      <span>{item.quantity} × {item.name}</span>
                      <strong>{peso(item.quantity * item.unit_price)}</strong>
                    </li>
                  ))}
                </ul>
                {order.notes && <p className="customer-order-notes">Note: {order.notes}</p>}
                <div className="customer-order-total"><span>Total</span><strong>{peso(order.total_amount)}</strong></div>
                {order.status === 'pending' && !order.archived && (
                  <button className="order-cancel-button" type="button" disabled={canceling === order.order_id} onClick={() => cancelOrder(order.order_id)}>
                    {canceling === order.order_id ? 'Canceling…' : 'Cancel order'}
                  </button>
                )}
              </article>
            ))}
          </div>}
    </section>
  )
}

export default CustomerOrders
