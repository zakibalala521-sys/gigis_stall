const crypto = require('node:crypto')
const { supabaseRequest } = require('../../lib/auth')

function respond(res, status, body) {
  res.setHeader('Cache-Control', 'no-store')
  return res.status(status).json(body)
}

async function findUser(email) {
  const query = new URLSearchParams({
    select: 'user_id,full_name,email,password_hash,role,status',
    email: `eq.${email}`,
    limit: '1',
  })
  const response = await supabaseRequest(`users?${query}`)
  const users = await response.json()
  return users[0] || null
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return respond(res, 405, { success: false, message: 'Method not allowed.' })
  }

  const token = typeof req.body?.token === 'string' ? req.body.token : ''
  if (!/^[a-f0-9]{64}$/.test(token)) {
    return respond(res, 400, { success: false, message: 'This verification link is invalid or has expired.' })
  }

  try {
    const now = new Date().toISOString()
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    const tokenQuery = new URLSearchParams({
      select: 'token_id,pending_id',
      token_hash: `eq.${tokenHash}`,
      expires_at: `gt.${now}`,
      limit: '1',
    })
    const tokenResponse = await supabaseRequest(`pending_account_tokens?${tokenQuery}`)
    const tokens = await tokenResponse.json()
    if (tokens.length !== 1) {
      return respond(res, 400, { success: false, message: 'This verification link is invalid or has expired.' })
    }

    const pendingQuery = new URLSearchParams({
      select: 'pending_id,full_name,email,password_hash,role,status',
      pending_id: `eq.${tokens[0].pending_id}`,
      expires_at: `gt.${now}`,
      limit: '1',
    })
    const pendingResponse = await supabaseRequest(`pending_accounts?${pendingQuery}`)
    const pendingAccounts = await pendingResponse.json()
    const pending = pendingAccounts[0]
    if (!pending || pending.role !== 'customer' || pending.status === 'suspended') {
      return respond(res, 400, { success: false, message: 'This verification link is invalid or has expired.' })
    }

    let user = await findUser(pending.email)
    if (user && (
      user.role !== 'customer'
      || user.email !== pending.email
      || user.password_hash !== pending.password_hash
      || user.full_name !== pending.full_name
    )) {
      return respond(res, 409, { success: false, message: 'An account already uses this email. Please sign in.' })
    }

    if (!user) {
      try {
        const createdResponse = await supabaseRequest('users?select=user_id,full_name,email,password_hash,role,status', {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({
            full_name: pending.full_name,
            email: pending.email,
            password_hash: pending.password_hash,
            role: 'customer',
            status: 'active',
          }),
        })
        const createdUsers = await createdResponse.json()
        user = createdUsers[0]
        if (!user) throw new Error('Verified customer account was not created.')
      } catch (error) {
        if (error.status !== 409) throw error
        user = await findUser(pending.email)
        if (!user || user.password_hash !== pending.password_hash || user.role !== 'customer') throw error
      }
    }

    await supabaseRequest('account_verifications?on_conflict=user_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ user_id: user.user_id, verified_at: now }),
    })
    await supabaseRequest(`pending_accounts?${new URLSearchParams({ pending_id: `eq.${pending.pending_id}` })}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    })

    return respond(res, 200, { success: true, message: 'Email verified. Your account is ready; you can now sign in.' })
  } catch (error) {
    console.error('Email verification failed.', error)
    return respond(res, 500, { success: false, message: 'Could not verify this email. Please try again later.' })
  }
}
