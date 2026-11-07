const { readSession, supabaseRequest } = require('../lib/auth')
const { createOrder, validateOrderInput } = require('../lib/orders')

function respond(res, status, body) {
  res.setHeader('Cache-Control', 'no-store')
  return res.status(status).json(body)
}

async function getActiveCustomer(req) {
  const sessionUser = readSession(req)
  if (!sessionUser) return { user: null, status: 401 }
  if (sessionUser.role !== 'customer') return { user: null, status: 403 }

  const query = new URLSearchParams({
    select: 'user_id,role,status',
    user_id: `eq.${sessionUser.user_id}`,
    limit: '1',
  })
  const response = await supabaseRequest(`users?${query}`)
  const users = await response.json()
  const user = users[0]
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
      select: 'order_id,customer_id,order_type,status,notes,created_at,updated_at,users!orders_customer_id_fkey(full_name),order_items(order_item_id,product_id,quantity,unit_price,products(name,image))',
      customer_id: `eq.${customerId}`,
      order: 'created_at.desc',
    }),
    fetchAll('customer_order_history', {
      select: 'order_id,customer_id,customer_name,order_type,order_status,notes,placed_at,finalized_at,total_amount,items,outcome',
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
      return respond(res, 200, { success: true, orders })
    }

    if (req.method === 'POST') {
      const validation = validateOrderInput(req.body)
      if (validation.error) return respond(res, 400, { success: false, message: validation.error })
      const created = await createOrder(result.user.user_id, validation.values)
      return respond(res, 201, { success: true, order_id: created.order_id, total_amount: created.total_amount, message: 'Your order has been placed.' })
    }

    const orderId = Number(req.body?.order_id)
    if (!Number.isInteger(orderId) || orderId < 1 || req.body?.action !== 'cancel') {
      return respond(res, 400, { success: false, message: 'Choose a valid pending order to cancel.' })
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
    if (error.status === 400) return respond(res, 409, { success: false, message: 'The menu changed or an item is no longer available. Refresh your cart and try again.' })
    if (error.status === 409) return respond(res, 409, { success: false, message: error.message })
    return respond(res, 500, { success: false, message: 'Could not complete the order request.' })
  }
}
