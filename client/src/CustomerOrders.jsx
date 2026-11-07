import { Fragment, useCallback, useEffect, useState } from 'react'

const apiUrl = import.meta.env.VITE_API_URL || ''
const peso = (value) => `₱${Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const dateTime = (value) => new Date(value).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })

function CustomerOrders({ mode = 'active' }) {
  const [orders, setOrders] = useState([])
  const [products, setProducts] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyOrder, setBusyOrder] = useState(null)
  const [expandedOrder, setExpandedOrder] = useState(null)
  const [editingOrder, setEditingOrder] = useState(null)
  const [editItems, setEditItems] = useState([])
  const [editNotes, setEditNotes] = useState('')
  const [addProductId, setAddProductId] = useState('')

  const loadOrders = useCallback(async () => {
    try {
      const [ordersResponse, menuResponse] = await Promise.all([
        fetch(`${apiUrl}/api/orders`, { credentials: 'include' }),
        fetch(`${apiUrl}/api/menu`),
      ])
      const [orderData, menuData] = await Promise.all([ordersResponse.json(), menuResponse.json()])
      if (!ordersResponse.ok || !orderData.success) throw new Error(orderData.message || 'Could not load your orders.')
      if (!menuResponse.ok || !menuData.success) throw new Error(menuData.message || 'Could not load menu items.')
      setOrders(mode === 'history' ? orderData.history : orderData.active_orders)
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
    return () => {
      window.clearTimeout(initialTimer)
      window.clearInterval(timer)
    }
  }, [loadOrders])

  const startEditing = (order) => {
    setExpandedOrder(order.order_id)
    setEditingOrder(order.order_id)
    setEditItems(order.items.map((item) => ({ product_id: item.product_id, name: item.name, unit_price: item.unit_price, quantity: item.quantity })))
    setEditNotes(order.notes || '')
    setAddProductId('')
  }

  const updateQuantity = (productId, quantity) => {
    setEditItems((current) => current
      .map((item) => item.product_id === productId ? { ...item, quantity } : item)
      .filter((item) => item.quantity > 0))
  }

  const addItem = () => {
    const product = products.find((item) => item.product_id === Number(addProductId))
    if (!product) return
    setEditItems((current) => {
      const existing = current.find((item) => item.product_id === product.product_id)
      if (existing) return current.map((item) => item.product_id === product.product_id
        ? { ...item, quantity: Math.min(99, item.quantity + 1) } : item)
      return [...current, { product_id: product.product_id, name: product.name, unit_price: Number(product.price), quantity: 1 }]
    })
    setAddProductId('')
  }

  const saveEdit = async (orderId) => {
    setBusyOrder(orderId)
    setError('')
    try {
      const response = await fetch(`${apiUrl}/api/orders`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'edit',
          order_id: orderId,
          notes: editNotes,
          items: editItems.map(({ product_id, quantity }) => ({ product_id, quantity })),
        }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.message || 'Could not update your order.')
      setEditingOrder(null)
      await loadOrders()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusyOrder(null)
    }
  }

  const cancelOrder = async (orderId) => {
    setBusyOrder(orderId)
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
      setBusyOrder(null)
    }
  }

  return (
    <section className="order-history-page">
      <div className="admin-heading">
        <div><p className="eyebrow">{mode === 'history' ? 'Past orders' : 'In progress'}</p><h1>{mode === 'history' ? <>Order<br /><i>history.</i></> : <>My<br /><i>orders.</i></>}</h1></div>
      </div>
      {error && <p className="dashboard-error" role="alert">{error}</p>}
      {loading && orders.length === 0 ? <p className="empty-state">Loading {mode === 'history' ? 'order history' : 'your orders'}...</p>
        : orders.length === 0 ? <p className="empty-state">{mode === 'history' ? 'No completed or canceled orders yet.' : 'You have no active orders.'}</p>
          : <div className="dashboard-table-wrap">
            <table className="dashboard-table customer-orders-table">
              <thead><tr><th>Order ID</th><th>Placed</th><th>Total</th><th>Status</th><th>Details</th></tr></thead>
              <tbody>
                {orders.map((order) => {
                  const expanded = expandedOrder === order.order_id
                  const canEdit = mode === 'active' && !order.archived && order.status === 'pending'
                  return <Fragment key={`${order.order_id}-${order.archived ? 'archived' : 'current'}`}>
                    <tr className="expandable-order-row" onClick={() => setExpandedOrder(expanded ? null : order.order_id)}>
                      <td><button className="row-expand-button" type="button" aria-expanded={expanded}>#{order.order_id} {expanded ? '−' : '+'}</button></td>
                      <td>{dateTime(order.created_at)}</td><td>{peso(order.total_amount)}</td>
                      <td><span className={`order-status status-${order.status.replaceAll(' ', '-')}`}>{order.status}</span></td>
                      <td>{expanded ? 'Hide' : 'View'}</td>
                    </tr>
                    {expanded && <tr className="expanded-order-row"><td colSpan="5">
                      <ul className="admin-order-items">
                        {(editingOrder === order.order_id ? editItems : order.items).map((item, index) => (
                          <li key={`${order.order_id}-${item.product_id}-${index}`}>
                            <span>{item.quantity} × {item.name}</span>
                            <strong>{peso(item.quantity * item.unit_price)}</strong>
                            {editingOrder === order.order_id && <input aria-label={`Quantity of ${item.name}`} type="number" min="0" max="99" value={item.quantity} onChange={(event) => updateQuantity(item.product_id, Math.max(0, Math.min(99, Number(event.target.value) || 0)))} />}
                          </li>
                        ))}
                      </ul>
                      {editingOrder === order.order_id
                        ? <>
                          <div className="customer-edit-add">
                            <select aria-label="Add menu item" value={addProductId} onChange={(event) => setAddProductId(event.target.value)}>
                              <option value="">Add an available menu item</option>
                              {products.map((product) => <option value={product.product_id} key={product.product_id}>{product.name} · {peso(product.price)}</option>)}
                            </select>
                            <button className="order-cancel-button" type="button" disabled={!addProductId} onClick={addItem}>Add item</button>
                          </div>
                          <label className="customer-edit-notes">Order notes <input maxLength="255" value={editNotes} onChange={(event) => setEditNotes(event.target.value)} /></label>
                        </>
                        : order.notes && <p className="customer-order-notes">Note: {order.notes}</p>}
                      <p className="order-payment-note">Take-out · {order.payment_method || 'Cash on Pick-up'}</p>
                      {canEdit && <div className="customer-order-actions">
                        {editingOrder === order.order_id
                          ? <><button className="order-cancel-button" type="button" disabled={busyOrder === order.order_id || editItems.length === 0} onClick={() => saveEdit(order.order_id)}>{busyOrder === order.order_id ? 'Saving…' : 'Save changes'}</button><button className="order-cancel-button" type="button" onClick={() => setEditingOrder(null)}>Discard</button></>
                          : <button className="order-cancel-button" type="button" onClick={() => startEditing(order)}>Edit order</button>}
                        <button className="order-cancel-button" type="button" disabled={busyOrder === order.order_id} onClick={() => cancelOrder(order.order_id)}>{busyOrder === order.order_id ? 'Please wait…' : 'Cancel order'}</button>
                      </div>}
                    </td></tr>}
                  </Fragment>
                })}
              </tbody>
            </table>
          </div>}
    </section>
  )
}

export default CustomerOrders
