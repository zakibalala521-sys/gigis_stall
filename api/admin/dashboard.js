const { readSession, supabaseRequest } = require('../../lib/auth')

const PAGE_SIZE = 500

async function getOrders() {
  const orders = []

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const query = new URLSearchParams({
      select: 'order_id,customer_id,customer_name,order_type,status,notes,created_at,item_count,total_amount',
      order: 'created_at.desc',
      limit: String(PAGE_SIZE),
      offset: String(offset),
    })
    const response = await supabaseRequest(`v_order_summary?${query}`)
    const page = await response.json()
    orders.push(...page)
    if (page.length < PAGE_SIZE) return orders
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ success: false, message: 'Method not allowed.' })
  }

  try {
    const sessionUser = readSession(req)
    if (!sessionUser) {
      return res.status(401).json({ success: false, message: 'Sign in to view the dashboard.' })
    }
    if (sessionUser.role !== 'owner') {
      return res.status(403).json({ success: false, message: 'Owner access is required.' })
    }

    const userQuery = new URLSearchParams({
      select: 'role,status',
      user_id: `eq.${sessionUser.user_id}`,
      limit: '1',
    })
    const userResponse = await supabaseRequest(`users?${userQuery}`)
    const users = await userResponse.json()
    if (users.length !== 1 || users[0].role !== 'owner' || users[0].status !== 'active') {
      return res.status(403).json({ success: false, message: 'Owner access is required.' })
    }

    const [orders, vendorCountResponse] = await Promise.all([
      getOrders(),
      supabaseRequest('users?select=user_id&role=eq.vendor&status=eq.pending', {
        method: 'HEAD',
        headers: { Prefer: 'count=exact', Range: '0-0' },
      }),
    ])
    const today = new Date().toISOString().slice(0, 10)
    const vendorCount = Number(vendorCountResponse.headers.get('content-range')?.split('/')[1])
    if (!Number.isFinite(vendorCount)) {
      throw new Error('Could not count pending vendor accounts.')
    }

    const successfulOrders = orders.filter((order) => order.status === 'picked up')
    const openOrders = orders.filter((order) => ['pending', 'ready to pick up'].includes(order.status))
    const todaySales = successfulOrders
      .filter((order) => order.created_at.slice(0, 10) === today)
      .reduce((total, order) => total + Number(order.total_amount), 0)
    const totalSales = successfulOrders.reduce((total, order) => total + Number(order.total_amount), 0)

    return res.status(200).json({
      success: true,
      dashboard: {
        today_sales: todaySales,
        open_orders: openOrders.length,
        total_sales: totalSales,
        total_orders: orders.length,
        pending_vendors: vendorCount,
        recent_orders: orders.slice(0, 20),
      },
    })
  } catch (error) {
    console.error('Owner dashboard request failed.', error)
    return res.status(500).json({ success: false, message: 'Could not load the owner dashboard.' })
  }
}
