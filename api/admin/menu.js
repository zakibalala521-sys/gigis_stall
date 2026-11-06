const crypto = require('node:crypto')
const { getActiveOwner } = require('../../lib/owner')
const { supabaseRequest } = require('../../lib/auth')

const MAX_IMAGE_BYTES = 2 * 1024 * 1024
const IMAGE_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
])
const PRODUCT_FIELDS = 'product_id,category_id,name,description,unit,price,image,is_available,is_archived,categories(name)'

function respond(res, status, body) {
  res.setHeader('Cache-Control', 'no-store')
  return res.status(status).json(body)
}

function validateProduct(body) {
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const description = typeof body.description === 'string' ? body.description.trim() : ''
  const unit = typeof body.unit === 'string' ? body.unit.trim() : ''
  const categoryId = Number(body.category_id)
  const price = Number(body.price)

  if (!name || name.length > 100) return { error: 'Enter a dish name of up to 100 characters.' }
  if (!Number.isInteger(categoryId) || categoryId < 1) return { error: 'Choose a menu category.' }
  if (!Number.isFinite(price) || price < 0 || price > 999999.99) return { error: 'Enter a valid price.' }
  if (!unit || unit.length > 30) return { error: 'Enter a serving unit of up to 30 characters.' }
  if (description.length > 255) return { error: 'Description must be 255 characters or fewer.' }
  if (typeof body.is_available !== 'boolean') return { error: 'Choose whether the dish is available or sold out.' }

  return {
    values: {
      name,
      category_id: categoryId,
      description: description || null,
      unit,
      price,
      is_available: body.is_available ? 1 : 0,
    },
  }
}

function storageConfig() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'menu-images'
  if (!url || !key) throw new Error('Supabase storage credentials are not configured.')
  return { url: new URL(url), key, bucket }
}

async function storageRequest(path, options = {}) {
  const { url, key } = storageConfig()
  const response = await fetch(new URL(`/storage/v1/${path}`, url), {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...options.headers,
    },
  })
  if (!response.ok) {
    const error = new Error(`Supabase Storage request failed with status ${response.status}.`)
    error.status = response.status
    throw error
  }
  return response
}

function parseImage(image) {
  if (image === undefined) return null
  if (!image || typeof image !== 'object' || typeof image.data !== 'string' || typeof image.type !== 'string') {
    throw new Error('Choose a valid JPEG, PNG, or WebP image.')
  }
  const extension = IMAGE_TYPES.get(image.type)
  const match = image.data.match(/^data:([^;]+);base64,([A-Za-z0-9+/]+={0,2})$/)
  if (!extension || !match || match[1] !== image.type) {
    throw new Error('Choose a valid JPEG, PNG, or WebP image.')
  }
  const buffer = Buffer.from(match[2], 'base64')
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES || buffer.toString('base64') !== match[2]) {
    throw new Error('Images must be smaller than 2 MB.')
  }
  return { buffer, type: image.type, extension }
}

async function uploadImage(image) {
  const { url, bucket } = storageConfig()
  const objectPath = `${crypto.randomUUID()}.${image.extension}`
  await storageRequest(`object/${encodeURIComponent(bucket)}/${objectPath}`, {
    method: 'POST',
    headers: {
      'Content-Type': image.type,
      'Cache-Control': 'max-age=31536000, immutable',
      'x-upsert': 'false',
    },
    body: image.buffer,
  })
  const publicUrl = new URL(`/storage/v1/object/public/${encodeURIComponent(bucket)}/${objectPath}`, url)
  return { objectPath, publicUrl: publicUrl.toString() }
}

function imageObjectPath(imageUrl) {
  if (typeof imageUrl !== 'string') return null
  const { url, bucket } = storageConfig()
  try {
    const image = new URL(imageUrl)
    const prefix = `/storage/v1/object/public/${encodeURIComponent(bucket)}/`
    if (image.origin !== url.origin || !image.pathname.startsWith(prefix)) return null
    return image.pathname.slice(prefix.length)
  } catch {
    return null
  }
}

async function removeImage(imageUrl) {
  const objectPath = imageObjectPath(imageUrl)
  if (!objectPath) return
  const { bucket } = storageConfig()
  await storageRequest(`object/${encodeURIComponent(bucket)}/${objectPath}`, { method: 'DELETE' })
}

async function checkOwner(req, res) {
  const result = await getActiveOwner(req)
  if (!result.user) {
    respond(res, result.status, {
      success: false,
      message: result.status === 401 ? 'Sign in as the owner to manage the menu.' : 'Owner access is required.',
    })
    return null
  }
  return result.user
}

async function getProduct(productId) {
  const query = new URLSearchParams({
    select: 'product_id,image,is_archived',
    product_id: `eq.${productId}`,
    limit: '1',
  })
  const response = await supabaseRequest(`products?${query}`)
  const products = await response.json()
  return products[0] || null
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, PATCH, DELETE')
    return respond(res, 405, { success: false, message: 'Method not allowed.' })
  }

  try {
    const owner = await checkOwner(req, res)
    if (!owner) return

    if (req.method === 'GET') {
      const [productsResponse, categoriesResponse] = await Promise.all([
        supabaseRequest(`products?${new URLSearchParams({
          select: PRODUCT_FIELDS,
          order: 'name',
        })}`),
        supabaseRequest(`categories?${new URLSearchParams({
          select: 'category_id,name',
          order: 'sort_order,name',
        })}`),
      ])
      const [products, categories] = await Promise.all([productsResponse.json(), categoriesResponse.json()])
      return respond(res, 200, { success: true, products, categories })
    }

    if (
      req.method === 'POST'
      || (req.method === 'PATCH' && (
        req.body?.name !== undefined
        || req.body?.category_id !== undefined
        || req.body?.is_archived !== undefined
      ))
    ) {
      const productId = Number(req.body?.product_id)
      const isUpdate = req.method === 'PATCH'
      if (isUpdate && (!Number.isInteger(productId) || productId < 1)) {
        return respond(res, 400, { success: false, message: 'Choose a valid menu item.' })
      }

      const validation = validateProduct(req.body || {})
      if (validation.error) return respond(res, 400, { success: false, message: validation.error })

      const requestedArchiveState = req.body?.is_archived
      if (requestedArchiveState !== undefined && typeof requestedArchiveState !== 'boolean') {
        return respond(res, 400, { success: false, message: 'Invalid menu item state.' })
      }
      const removeRequestedImage = req.body?.remove_image
      if (removeRequestedImage !== undefined && typeof removeRequestedImage !== 'boolean') {
        return respond(res, 400, { success: false, message: 'Invalid image state.' })
      }

      let image
      try {
        image = parseImage(req.body?.image)
      } catch (error) {
        return respond(res, 400, { success: false, message: error.message })
      }
      const existing = isUpdate ? await getProduct(productId) : null
      if (isUpdate && !existing) return respond(res, 404, { success: false, message: 'Menu item not found.' })

      let uploaded
      try {
        if (image) uploaded = await uploadImage(image)

        if (isUpdate) {
          const values = {
            ...validation.values,
            updated_by: owner.user_id,
          }
          if (uploaded) values.image = uploaded.publicUrl
          else if (removeRequestedImage) values.image = null
          if (requestedArchiveState !== undefined) {
            values.is_archived = requestedArchiveState ? 1 : 0
            if (!requestedArchiveState) values.is_available = 1
          }

          const query = new URLSearchParams({
            product_id: `eq.${productId}`,
            is_archived: 'eq.0',
            select: 'product_id',
          })
          if (existing.is_archived) {
            query.delete('is_archived')
            query.set('is_archived', 'eq.1')
          }
          const response = await supabaseRequest(`products?${query}`, {
            method: 'PATCH',
            headers: { Prefer: 'return=representation' },
            body: JSON.stringify(values),
          })
          const updated = await response.json()
          if (updated.length !== 1) return respond(res, 409, { success: false, message: 'The menu item changed. Refresh and try again.' })
        } else {
          const response = await supabaseRequest(`products?${new URLSearchParams({ select: 'product_id' })}`, {
            method: 'POST',
            headers: { Prefer: 'return=representation' },
            body: JSON.stringify({
              ...validation.values,
              image: uploaded?.publicUrl || null,
              created_by: owner.user_id,
              updated_by: owner.user_id,
            }),
          })
          const created = await response.json()
          if (created.length !== 1) throw new Error('The menu item was not created.')
        }
      } catch (error) {
        if (uploaded) {
          try {
            await removeImage(uploaded.publicUrl)
          } catch (cleanupError) {
            console.error('Could not clean up an unused menu image.', cleanupError)
          }
        }
        if (error.status === 409) {
          return respond(res, 409, { success: false, message: 'A menu item with that name already exists.' })
        }
        if (error.status === 400) {
          return respond(res, 400, { success: false, message: 'The category or menu item data is invalid.' })
        }
        throw error
      }

      if (isUpdate && (uploaded || removeRequestedImage) && existing.image) {
        try {
          await removeImage(existing.image)
        } catch (error) {
          console.error('Menu item was saved, but its previous image could not be removed.', error)
        }
      }
      return respond(res, isUpdate ? 200 : 201, { success: true, message: isUpdate ? 'Menu item updated.' : 'Menu item added.' })
    }

    const productId = Number(req.body?.product_id)
    if (!Number.isInteger(productId) || productId < 1) {
      return respond(res, 400, { success: false, message: 'Choose a valid menu item.' })
    }

    const existing = await getProduct(productId)
    if (!existing) return respond(res, 404, { success: false, message: 'Menu item not found.' })

    if (req.method === 'PATCH') {
      if (existing.is_archived) {
        return respond(res, 409, { success: false, message: 'Restore this item before changing its availability.' })
      }
      if (typeof req.body?.is_available !== 'boolean') {
        return respond(res, 400, { success: false, message: 'Choose whether the dish is available or sold out.' })
      }
      const query = new URLSearchParams({
        product_id: `eq.${productId}`,
        select: 'product_id',
      })
      const response = await supabaseRequest(`products?${query}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ is_available: req.body.is_available ? 1 : 0, updated_by: owner.user_id }),
      })
      const updated = await response.json()
      if (updated.length !== 1) return respond(res, 409, { success: false, message: 'The menu item changed. Refresh and try again.' })
      return respond(res, 200, { success: true, message: 'Availability updated.' })
    }

    const references = await supabaseRequest(`order_items?${new URLSearchParams({
      select: 'order_item_id',
      product_id: `eq.${productId}`,
      limit: '1',
    })}`)
    const orderedItems = await references.json()
    if (orderedItems.length) {
      await supabaseRequest(`products?${new URLSearchParams({ product_id: `eq.${productId}` })}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ is_archived: 1, is_available: 0, updated_by: owner.user_id }),
      })
      return respond(res, 200, { success: true, message: 'Dish removed from the menu and archived to preserve order history.' })
    }

    await supabaseRequest(`products?${new URLSearchParams({ product_id: `eq.${productId}` })}`, { method: 'DELETE' })
    if (existing.image) {
      try {
        await removeImage(existing.image)
      } catch (error) {
        console.error('Menu item was deleted, but its image could not be removed.', error)
      }
    }
    return respond(res, 200, { success: true, message: 'Menu item removed.' })
  } catch (error) {
    console.error('Admin menu request failed.', error)
    return respond(res, 500, { success: false, message: 'Could not complete the menu request.' })
  }
}
