const { supabaseRequest } = require('./auth')

function validateOrderInput(body) {
  const items = body?.items
  const notes = typeof body?.notes === 'string' ? body.notes.trim() : ''

  if (notes.length > 255) return { error: 'Order notes must be 255 characters or fewer.' }
  if (!Array.isArray(items) || items.length < 1 || items.length > 50) {
    return { error: 'Add between 1 and 50 menu items to the order.' }
  }

  const normalizedItems = []
  const seenProductIds = new Set()
  for (const item of items) {
    const rawProductId = item?.product_id
    const rawQuantity = item?.quantity
    if (
      ![typeof rawProductId, typeof rawQuantity].every((type) => type === 'number' || type === 'string')
      || (typeof rawProductId === 'string' && !/^\d+$/.test(rawProductId))
      || (typeof rawQuantity === 'string' && !/^\d+$/.test(rawQuantity))
    ) {
      return { error: 'The order contains an invalid menu item or quantity.' }
    }
    const productId = Number(rawProductId)
    const quantity = Number(rawQuantity)
    if (!Number.isInteger(productId) || productId < 1 || seenProductIds.has(productId)) {
      return { error: 'The order contains an invalid or repeated menu item.' }
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      return { error: 'Each item quantity must be between 1 and 99.' }
    }
    seenProductIds.add(productId)
    normalizedItems.push({ product_id: productId, quantity })
  }

  return { values: { items: normalizedItems, order_type: 'take-out', notes: notes || null } }
}

async function createOrder(customerId, values) {
  const response = await supabaseRequest('rpc/create_order_for_customer', {
    method: 'POST',
    body: JSON.stringify({
      p_customer_id: customerId,
      p_order_type: 'take-out',
      p_notes: values.notes,
      p_items: values.items,
    }),
  })
  const created = await response.json()
  if (created.length !== 1 || !Number.isInteger(created[0].order_id)) {
    throw new Error('The order was not created.')
  }
  return created[0]
}

async function updatePendingOrder(orderId, customerId, values) {
  const response = await supabaseRequest('rpc/update_pending_customer_order', {
    method: 'POST',
    body: JSON.stringify({
      p_order_id: orderId,
      p_customer_id: customerId,
      p_notes: values.notes,
      p_items: values.items,
    }),
  })
  const updated = await response.json()
  if (updated.length !== 1) throw new Error('The pending order was not updated.')
  return updated[0]
}

module.exports = { createOrder, updatePendingOrder, validateOrderInput }
