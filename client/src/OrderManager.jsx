import { Fragment, useCallback, useEffect, useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { apiFetch } from './api'
import { supabase } from './supabase'

const apiUrl = import.meta.env.VITE_API_URL || ''
const STATUSES = ['pending', 'ready to pick up', 'picked up', 'canceled']
const peso = (value) => `₱${Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const dateTime = (value) => new Date(value).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })

function OrderManager({ mode = 'active' }) {
  const [orders, setOrders] = useState([])
  const [customers, setCustomers] = useState([])
  const [products, setProducts] = useState([])
  const [customerId, setCustomerId] = useState('')
  const [productId, setProductId] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [draftItems, setDraftItems] = useState([])
  const [notes, setNotes] = useState('')
  const [expandedOrder, setExpandedOrder] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const loadOrders = useCallback(async () => {
    try {
      const [ordersResponse, menuResponse] = await Promise.all([
        apiFetch(`${apiUrl}/api/admin/orders`),
        fetch(`${apiUrl}/api/menu`),
      ])
      const [orderData, menuData] = await Promise.all([ordersResponse.json(), menuResponse.json()])
      if (!ordersResponse.ok || !orderData.success) throw new Error(orderData.message || 'Could not load orders.')
      if (!menuResponse.ok || !menuData.success) throw new Error(menuData.message || 'Could not load menu items.')
      setOrders(mode === 'history' ? orderData.history : orderData.active_orders)
      setCustomers(orderData.customers)
      setProducts(menuData.products.filter((product) => product.is_available === 1))
      setError('')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }, [mode])

  useEffect(() => {
    const initialTimer = window.setTimeout(() => loadOrders(), 0)
    const timer = window.setInterval(() => loadOrders(), 10000)
    const channel = supabase?.channel('admin-orders')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'orders',
      }, () => loadOrders())
      .subscribe()
    return () => {
      window.clearTimeout(initialTimer)
      window.clearInterval(timer)
      if (channel) supabase.removeChannel(channel)
    }
  }, [loadOrders])

  const addDraftItem = () => {
    const product = products.find((item) => item.product_id === Number(productId))
    if (!product) return
    const count = Math.max(1, Math.min(99, Number(quantity) || 1))
    setDraftItems((current) => {
      const existing = current.find((item) => item.product_id === product.product_id)
      if (existing) return current.map((item) => item.product_id === product.product_id
        ? { ...item, quantity: Math.min(99, item.quantity + count) } : item)
      return [...current, { ...product, quantity: count }]
    })
    setProductId('')
    setQuantity(1)
  }

  const createOrder = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const response = await apiFetch(`${apiUrl}/api/admin/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: Number(customerId),
          notes,
          items: draftItems.map(({ product_id, quantity: count }) => ({ product_id, quantity: count })),
        }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.message || 'Could not create order.')
      setCustomerId('')
      setDraftItems([])
      setNotes('')
      await loadOrders()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  const changeStatus = async (orderId, status) => {
    setError('')
    try {
      const response = await apiFetch(`${apiUrl}/api/admin/orders`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, status }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.message || 'Could not update order status.')
      await loadOrders()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  const deleteOrder = async (orderId) => {
    if (!window.confirm(`Delete active order #${orderId}?`)) return
    setError('')
    try {
      const response = await apiFetch(`${apiUrl}/api/admin/orders`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.message || 'Could not delete order.')
      await loadOrders()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  const showDetails = (order) => (
    <div className="order-detail-content">
      <ul className="admin-order-items">
        {order.items.map((item, index) => (
          <li key={item.order_item_id || `${order.order_id}-${item.product_id}-${index}`}>
            <span>{item.quantity} × {item.name}</span><strong>{peso(item.quantity * item.unit_price)}</strong>
          </li>
        ))}
      </ul>
      {order.notes && <p className="customer-order-notes">Note: {order.notes}</p>}
      <p className="order-payment-note">Payment: {order.payment_method || 'Cash on Pick-up'} · {order.order_type}</p>
    </div>
  )

  return (
    <section className={`dashboard-orders order-manager ${mode === 'history' ? 'history-manager' : ''}`}>
      {error && <p className="dashboard-error" role="alert">{error}</p>}
      {mode === 'active' && <form className="admin-order-form" onSubmit={createOrder}>
        <h3>Create an order for a customer</h3>
        <div className="admin-order-fields">
          <label>Customer
            <select required value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
              <option value="">Select customer</option>
              {customers.map((customer) => <option value={customer.user_id} key={customer.user_id}>{customer.full_name} ({customer.email})</option>)}
            </select>
          </label>
          <label>Menu item
            <select value={productId} onChange={(event) => setProductId(event.target.value)}>
              <option value="">Select item</option>
              {products.map((product) => <option value={product.product_id} key={product.product_id}>{product.name} · {peso(product.price)}</option>)}
            </select>
          </label>
          <label>Qty <input type="number" min="1" max="99" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
          <button className="button button-dark" type="button" onClick={addDraftItem} disabled={!productId}><Plus size={16} /> Add item</button>
        </div>
        {draftItems.length > 0 && <ul className="admin-draft-items">
          {draftItems.map((item) => <li key={item.product_id}><span>{item.quantity} × {item.name}</span><strong>{peso(item.price * item.quantity)}</strong><button type="button" onClick={() => setDraftItems((current) => current.filter((entry) => entry.product_id !== item.product_id))} aria-label={`Remove ${item.name}`}><X size={15} /></button></li>)}
        </ul>}
        <label className="admin-notes-label">Order notes <input maxLength="255" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional" /></label>
        <p className="order-payment-note">Take-out · Cash on Pick-up</p>
        <button className="button button-dark" type="submit" disabled={saving || !customerId || draftItems.length === 0}>{saving ? 'Creating…' : 'Create order'} <span>→</span></button>
      </form>}

      {loading && orders.length === 0 ? <p className="empty-state">Loading {mode === 'history' ? 'order history' : 'active orders'}...</p>
        : orders.length === 0 ? <p className="empty-state">{mode === 'history' ? 'No completed or canceled orders yet.' : 'There are no active orders.'}</p>
          : <div className="dashboard-table-wrap">
            <table className="dashboard-table admin-orders-table">
              <thead><tr><th>Order ID</th><th>Customer</th><th>Timestamp</th><th>Total</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {orders.map((order) => {
                  const expanded = expandedOrder === order.order_id
                  const finalized = ['picked up', 'canceled'].includes(order.status)
                  return (
                    <Fragment key={`${order.order_id}-${order.archived ? 'archived' : 'current'}`}>
                      <tr className="expandable-order-row" onClick={() => setExpandedOrder(expanded ? null : order.order_id)}>
                        <td><button type="button" className="row-expand-button" aria-expanded={expanded}>#{order.order_id} {expanded ? '−' : '+'}</button></td>
                        <td>{order.customer_name}</td><td>{dateTime(order.created_at)}</td><td>{peso(order.total_amount)}</td>
                        <td><span className={`order-status status-${order.status.replaceAll(' ', '-')}`}>{order.status}</span></td>
                        <td onClick={(event) => event.stopPropagation()}>
                          {mode === 'active' && !finalized ? <div className="order-row-actions">
                            <select aria-label={`Status for order ${order.order_id}`} value={order.status} onChange={(event) => changeStatus(order.order_id, event.target.value)}>
                              {STATUSES.map((status) => <option value={status} key={status}>{status}</option>)}
                            </select>
                            <button className="order-delete-button" type="button" onClick={() => deleteOrder(order.order_id)} aria-label={`Delete order ${order.order_id}`}><Trash2 size={15} /></button>
                          </div> : <span className="order-locked">{finalized ? 'Finalized' : 'Read-only'}</span>}
                        </td>
                      </tr>
                      {expanded && <tr className="expanded-order-row"><td colSpan="6">{showDetails(order)}</td></tr>}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>}
    </section>
  )
}

export default OrderManager
