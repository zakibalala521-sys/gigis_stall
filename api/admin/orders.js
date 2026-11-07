const { getActiveOwner } = require('../../lib/owner')
const { supabaseRequest } = require('../../lib/auth')
const { createOrder, validateOrderInput } = require('../../lib/orders')

const ORDER_STATUSES = new Set(['pending', 'ready to pick up', 'picked up', 'canceled'])

function respond(res, status, body) {
  res.setHeader('Cache-Control', 'no-store')
  return res.status(status).json(body)
}

function formatOrder(order) {
  const items = order.items || (order.order_items || []).map((item) => ({
    order_item_id: item.order_item_id,
    product_id: item.product_id,
    name: item.products?.name || 'Menu item',
    image: item.products?.image || null,
    quantity: item.quantity,
    unit_price: Number(item.unit_price),
  }))
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
    total_amount: items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0),
    outcome: order.outcome || (order.status === 'picked up' ? 'successful' : order.status === 'canceled' ? 'canceled' : null),
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

async function requireOwner(req, res) {
  const result = await getActiveOwner(req)
  if (!result.user) {
    respond(res, result.status, {
      success: false,
      message: result.status === 401 ? 'Sign in as the owner to manage orders.' : 'Owner access is required.',
    })
    return null
  }
  return result.user
}

async function getAllOrders() {
  const [orders, history, customers] = await Promise.all([
    fetchAll('orders', {
      select: 'order_id,customer_id,order_type,payment_method,status,notes,created_at,updated_at,users!orders_customer_id_fkey(full_name),order_items(order_item_id,product_id,quantity,unit_price,products(name,image))',
      order: 'created_at.desc',
    }),
    fetchAll('customer_order_history', {
      select: 'order_id,customer_id,customer_name,order_type,payment_method,order_status,notes,placed_at,finalized_at,total_amount,items,outcome',
      order: 'placed_at.desc',
    }),
    fetchAll('users', {
      select: 'user_id,full_name,email',
      role: 'eq.customer',
      status: 'eq.active',
      order: 'full_name.asc',
    }),
  ])
  const currentIds = new Set(orders.map((order) => order.order_id))
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
      outcome: record.outcome,
      archived: true,
    }))
  return {
    active_orders: orders.map(formatOrder)
      .filter((order) => ['pending', 'ready to pick up'].includes(order.status))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    history: [...orders.map(formatOrder).filter((order) => ['picked up', 'canceled'].includes(order.status)), ...archived.map(formatOrder)]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    customers,
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, PATCH, DELETE')
    return respond(res, 405, { success: false, message: 'Method not allowed.' })
  }

  try {
    const owner = await requireOwner(req, res)
    if (!owner) return

    if (req.method === 'GET') {
      const data = await getAllOrders()
      return respond(res, 200, { success: true, ...data })
    }

    if (req.method === 'POST') {
      const customerId = Number(req.body?.customer_id)
      if (!Number.isInteger(customerId) || customerId < 1) {
        return respond(res, 400, { success: false, message: 'Choose a valid customer.' })
      }
      const customerQuery = new URLSearchParams({
        select: 'user_id',
        user_id: `eq.${customerId}`,
        role: 'eq.customer',
        status: 'eq.active',
        limit: '1',
      })
      const customerResponse = await supabaseRequest(`users?${customerQuery}`)
      const customers = await customerResponse.json()
      if (customers.length !== 1) return respond(res, 404, { success: false, message: 'Customer not found.' })

      const validation = validateOrderInput(req.body)
      if (validation.error) return respond(res, 400, { success: false, message: validation.error })
      const created = await createOrder(customerId, validation.values)
      return respond(res, 201, { success: true, order_id: created.order_id, total_amount: created.total_amount, message: 'Order created.' })
    }

    const orderId = Number(req.body?.order_id)
    if (!Number.isInteger(orderId) || orderId < 1) {
      return respond(res, 400, { success: false, message: 'Choose a valid order.' })
    }
    const orderQuery = new URLSearchParams({
      order_id: `eq.${orderId}`,
      select: 'order_id',
    })

    if (req.method === 'PATCH') {
      const status = req.body?.status
      if (!ORDER_STATUSES.has(status)) {
        return respond(res, 400, { success: false, message: 'Choose pending, ready to pick up, picked up, or canceled.' })
      }
      const activeOrderQuery = new URLSearchParams({
        order_id: `eq.${orderId}`,
        status: 'in.("pending","ready to pick up")',
        select: 'order_id',
      })
      const response = await supabaseRequest(`orders?${activeOrderQuery}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ status }),
      })
      const updated = await response.json()
      if (!updated.length) return respond(res, 409, { success: false, message: 'Finalized or missing orders are read-only.' })
      return respond(res, 200, { success: true, message: 'Order status updated.' })
    }

    const response = await supabaseRequest(`orders?${orderQuery}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=representation' },
    })
    const deleted = await response.json()
    if (!deleted.length) return respond(res, 404, { success: false, message: 'Order not found.' })
    return respond(res, 200, { success: true, message: 'Order deleted. Finalized history is retained.' })
  } catch (error) {
    console.error('Admin order request failed.', error)
    if (error.status === 400) return respond(res, 409, { success: false, message: 'The menu changed or an item is no longer available. Refresh the menu and try again.' })
    if (error.status === 409) return respond(res, 409, { success: false, message: error.message })
    return respond(res, 500, { success: false, message: 'Could not complete the admin order request.' })
  }
}
