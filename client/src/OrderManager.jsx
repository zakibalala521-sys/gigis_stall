import { useCallback, useEffect, useState } from 'react'
import { Plus, RefreshCw, Trash2, X } from 'lucide-react'

const apiUrl = import.meta.env.VITE_API_URL || ''
const STATUSES = ['pending', 'ready to pick up', 'picked up', 'canceled']
const peso = (value) => `₱${Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const dateTime = (value) => new Date(value).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })

function OrderManager() {
  const [orders, setOrders] = useState([])
  const [customers, setCustomers] = useState([])
  const [products, setProducts] = useState([])
  const [customerId, setCustomerId] = useState('')
  const [productId, setProductId] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [draftItems, setDraftItems] = useState([])
  const [orderType, setOrderType] = useState('take-out')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const loadOrders = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [ordersResponse, menuResponse] = await Promise.all([
        fetch(`${apiUrl}/api/admin/orders`, { credentials: 'include' }),
        fetch(`${apiUrl}/api/menu`),
      ])
      const [orderData, menuData] = await Promise.all([ordersResponse.json(), menuResponse.json()])
      if (!ordersResponse.ok || !orderData.success) throw new Error(orderData.message || 'Could not load orders.')
      if (!menuResponse.ok || !menuData.success) throw new Error(menuData.message || 'Could not load menu items.')
      setOrders(orderData.orders)
      setCustomers(orderData.customers)
      setProducts(menuData.products.filter((product) => product.is_available === 1))
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    Promise.all([
      fetch(`${apiUrl}/api/admin/orders`, { credentials: 'include' }),
      fetch(`${apiUrl}/api/menu`),
    ])
      .then(async ([ordersResponse, menuResponse]) => {
        const [orderData, menuData] = await Promise.all([ordersResponse.json(), menuResponse.json()])
        if (!ordersResponse.ok || !orderData.success) throw new Error(orderData.message || 'Could not load orders.')
        if (!menuResponse.ok || !menuData.success) throw new Error(menuData.message || 'Could not load menu items.')
        if (active) {
          setOrders(orderData.orders)
          setCustomers(orderData.customers)
          setProducts(menuData.products.filter((product) => product.is_available === 1))
        }
      })
      .catch((requestError) => { if (active) setError(requestError.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const addDraftItem = () => {
    const product = products.find((item) => item.product_id === Number(productId))
    if (!product) return
    setDraftItems((current) => {
      const existing = current.find((item) => item.product_id === product.product_id)
      if (existing) return current.map((item) => item.product_id === product.product_id
        ? { ...item, quantity: Math.min(99, item.quantity + Number(quantity)) } : item)
      return [...current, { ...product, quantity: Math.min(99, Number(quantity)) }]
    })
    setProductId('')
    setQuantity(1)
  }

  const createOrder = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const response = await fetch(`${apiUrl}/api/admin/orders`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: Number(customerId),
          order_type: orderType,
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
      const response = await fetch(`${apiUrl}/api/admin/orders`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, status }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.message || 'Could not update order status.')
      setOrders((current) => current.map((order) => order.order_id === orderId
        ? { ...order, status, outcome: status === 'picked up' ? 'successful' : status === 'canceled' ? 'canceled' : null }
        : order))
      await loadOrders()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  const deleteOrder = async (orderId) => {
    if (!window.confirm(`Delete order #${orderId}? Finalized order history will be retained.`)) return
    setError('')
    try {
      const response = await fetch(`${apiUrl}/api/admin/orders`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.message || 'Could not delete order.')
      setOrders((current) => current.filter((order) => order.order_id !== orderId))
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  return (
    <section className="dashboard-orders order-manager">
      <div className="dashboard-section-heading">
        <div><p className="eyebrow">Order management</p><h2>All orders</h2></div>
        <button className="button button-dark refresh-button" type="button" onClick={loadOrders} disabled={loading}><RefreshCw size={16} /> Refresh</button>
      </div>
      {error && <p className="dashboard-error" role="alert">{error}</p>}
      <form className="admin-order-form" onSubmit={createOrder}>
        <h3>Create an order for a customer</h3>
        <div className="admin-order-fields">
          <label>Customer
            <select required value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
              <option value="">Select customer</option>
              {customers.map((customer) => <option value={customer.user_id} key={customer.user_id}>{customer.full_name} ({customer.email})</option>)}
            </select>
          </label>
          <label>Order type
            <select value={orderType} onChange={(event) => setOrderType(event.target.value)}>
              <option value="take-out">Take-out</option><option value="dine-in">Dine-in</option><option value="delivery">Delivery</option>
            </select>
          </label>
          <label>Menu item
            <select value={productId} onChange={(event) => setProductId(event.target.value)}>
              <option value="">Select item</option>
              {products.map((product) => <option value={product.product_id} key={product.product_id}>{product.name} · {peso(product.price)}</option>)}
            </select>
          </label>
          <label>Qty
            <input type="number" min="1" max="99" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
          </label>
          <button className="button button-dark" type="button" onClick={addDraftItem} disabled={!productId}><Plus size={16} /> Add item</button>
        </div>
        {draftItems.length > 0 && <ul className="admin-draft-items">
          {draftItems.map((item) => <li key={item.product_id}><span>{item.quantity} × {item.name}</span><strong>{peso(item.price * item.quantity)}</strong><button type="button" onClick={() => setDraftItems((current) => current.filter((entry) => entry.product_id !== item.product_id))} aria-label={`Remove ${item.name}`}><X size={15} /></button></li>)}
        </ul>}
        <label className="admin-notes-label">Order notes <input maxLength="255" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional" /></label>
        <button className="button button-dark" type="submit" disabled={saving || !customerId || draftItems.length === 0}>{saving ? 'Creating…' : 'Create order'} <span>→</span></button>
      </form>

      {loading && orders.length === 0 ? <p className="empty-state">Loading orders...</p> : orders.length === 0
        ? <p className="empty-state">There are no orders yet.</p>
        : <div className="admin-order-list">
          {orders.map((order) => (
            <article className="admin-order-card" key={`${order.order_id}-${order.archived ? 'history' : 'active'}`}>
              <div className="admin-order-title">
                <div><span className="eyebrow">Order #{order.order_id}</span><h3>{order.customer_name}</h3><p>{dateTime(order.created_at)} · {order.order_type}</p></div>
                <strong>{peso(order.total_amount)}</strong>
              </div>
              <ul className="admin-order-items">
                {order.items.map((item, index) => <li key={item.order_item_id || `${order.order_id}-${item.product_id}-${index}`}><span>{item.quantity} × {item.name}</span><strong>{peso(item.quantity * item.unit_price)}</strong></li>)}
              </ul>
              {order.notes && <p className="customer-order-notes">Note: {order.notes}</p>}
              <div className="admin-order-actions">
                {order.archived ? <span className={`order-status status-${order.status.replaceAll(' ', '-')}`}>{order.status} · history</span> : <>
                  <label>Status
                    <select aria-label={`Status for order ${order.order_id}`} value={order.status} onChange={(event) => changeStatus(order.order_id, event.target.value)}>
                      {STATUSES.map((status) => <option value={status} key={status}>{status}</option>)}
                    </select>
                  </label>
                  {order.outcome && <strong className={`outcome-${order.outcome}`}>{order.outcome}</strong>}
                  <button className="order-delete-button" type="button" onClick={() => deleteOrder(order.order_id)} aria-label={`Delete order ${order.order_id}`}><Trash2 size={16} /> Delete</button>
                </>}
              </div>
            </article>
          ))}
        </div>}
    </section>
  )
}

export default OrderManager
