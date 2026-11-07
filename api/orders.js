const { getAuthenticatedUser, supabaseRequest } = require('../lib/auth')
const { createOrder, updatePendingOrder, validateOrderInput } = require('../lib/orders')

function respond(res, status, body) {
  res.setHeader('Cache-Control', 'no-store')
  return res.status(status).json(body)
}

async function getActiveCustomer(req) {
  const { user, status } = await getAuthenticatedUser(req)
  if (!user) return { user: null, status }
  if (!user || user.role !== 'customer' || user.status !== 'active') {
    return { user: null, status: 403 }
  }
  return { user, status: 200 }
}

function formatOrder(order) {
  const items = (order.order_items || []).map((item) => ({
    order_item_id: item.order_item_id,
    product_id: item.product_id,
    name: item.products?.name || 'Menu item',
    image: item.products?.image || null,
    quantity: item.quantity,
    unit_price: Number(item.unit_price),
  }))
  const total = items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0)
  return {
    order_id: order.order_id,
    customer_id: order.customer_id,
    customer_name: order.users?.full_name || order.customer_name || 'Customer',
    order_type: order.order_type,
    payment_method: order.payment_method || 'Cash on Pick-up',
    status: order.status,
    notes: order.notes,
    created_at: order.created_at,
    updated_at: order.updated_at,
    items,
    item_count: items.reduce((sum, item) => sum + item.quantity, 0),
    total_amount: total,
    outcome: order.status === 'picked up' ? 'successful'
      : order.status === 'canceled' ? 'canceled' : null,
    archived: Boolean(order.archived),
  }
}

async function fetchAll(path, params) {
  const rows = []
  for (let offset = 0; ; offset += 1000) {
    const query = new URLSearchParams({ ...params, limit: '1000', offset: String(offset) })
    const response = await supabaseRequest(`${path}?${query}`)
    const page = await response.json()
    rows.push(...page)
    if (page.length < 1000) return rows
  }
}

async function getCustomerOrders(customerId) {
  const [orders, history] = await Promise.all([
    fetchAll('orders', {
      select: 'order_id,customer_id,order_type,payment_method,status,notes,created_at,updated_at,users!orders_customer_id_fkey(full_name),order_items(order_item_id,product_id,quantity,unit_price,products(name,image))',
      customer_id: `eq.${customerId}`,
      order: 'created_at.desc',
    }),
    fetchAll('customer_order_history', {
      select: 'order_id,customer_id,customer_name,order_type,payment_method,order_status,notes,placed_at,finalized_at,total_amount,items,outcome',
      customer_id: `eq.${customerId}`,
      order: 'placed_at.desc',
    }),
  ])
  const currentIds = new Set(orders.map((order) => order.order_id))
  const active = orders.map(formatOrder)
  const archived = history
    .filter((record) => !currentIds.has(record.order_id))
    .map((record) => ({
      order_id: record.order_id,
      customer_id: record.customer_id,
      customer_name: record.customer_name,
      order_type: record.order_type,
      payment_method: record.payment_method || 'Cash on Pick-up',
      status: record.order_status,
      notes: record.notes,
      created_at: record.placed_at,
      updated_at: record.finalized_at,
      items: record.items || [],
      item_count: (record.items || []).reduce((sum, item) => sum + Number(item.quantity), 0),
      total_amount: Number(record.total_amount),
      outcome: record.outcome,
      archived: true,
    }))
  return [...active, ...archived].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
}

module.exports = async function handler(req, res) {
  if (!['GET', 'POST', 'PATCH'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, PATCH')
    return respond(res, 405, { success: false, message: 'Method not allowed.' })
  }

  try {
    const result = await getActiveCustomer(req)
    if (!result.user) {
      return respond(res, result.status, {
        success: false,
        message: result.status === 401 ? 'Sign in as a customer to manage orders.' : 'Customer access is required.',
      })
    }

    if (req.method === 'GET') {
      const orders = await getCustomerOrders(result.user.user_id)
      return respond(res, 200, {
        success: true,
        active_orders: orders.filter((order) => !order.archived && ['pending', 'ready to pick up'].includes(order.status)),
        history: orders.filter((order) => order.archived || ['picked up', 'canceled'].includes(order.status)),
      })
    }

    if (req.method === 'POST') {
      const validation = validateOrderInput(req.body)
      if (validation.error) return respond(res, 400, { success: false, message: validation.error })
      const created = await createOrder(result.user.user_id, validation.values)
      return respond(res, 201, { success: true, order_id: created.order_id, total_amount: created.total_amount, message: 'Your order has been placed.' })
    }

    const orderId = Number(req.body?.order_id)
    if (!Number.isInteger(orderId) || orderId < 1) {
      return respond(res, 400, { success: false, message: 'Choose a valid pending order to cancel.' })
    }
    if (req.body?.action === 'edit') {
      const validation = validateOrderInput(req.body)
      if (validation.error) return respond(res, 400, { success: false, message: validation.error })
      await updatePendingOrder(orderId, result.user.user_id, validation.values)
      return respond(res, 200, { success: true, message: 'Your pending order was updated.' })
    }
    if (req.body?.action !== 'cancel') {
      return respond(res, 400, { success: false, message: 'Choose edit or cancel for a pending order.' })
    }
    const query = new URLSearchParams({
      order_id: `eq.${orderId}`,
      customer_id: `eq.${result.user.user_id}`,
      status: 'eq.pending',
      select: 'order_id',
    })
    const response = await supabaseRequest(`orders?${query}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ status: 'canceled' }),
    })
    const updated = await response.json()
    if (updated.length !== 1) {
      return respond(res, 409, { success: false, message: 'Only your pending orders can be canceled.' })
    }
    return respond(res, 200, { success: true, message: 'Your order was canceled.' })
  } catch (error) {
    console.error('Customer order request failed.', error)
    if (error.status === 400 && req.body?.action === 'edit') return respond(res, 409, { success: false, message: 'Only your pending order can be edited, and all items must still be available.' })
    if (error.status === 400) return respond(res, 409, { success: false, message: 'The menu changed or an item is no longer available. Refresh your cart and try again.' })
    if (error.status === 409) return respond(res, 409, { success: false, message: error.message })
    return respond(res, 500, { success: false, message: 'Could not complete the order request.' })
  }
}
