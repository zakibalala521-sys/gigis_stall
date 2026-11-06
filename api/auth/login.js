const bcrypt = require('bcryptjs')
const { createSessionToken, setSessionCookie, supabaseRequest } = require('../../lib/auth')

const WINDOW_MINUTES = 15
const MAX_EMAIL_ATTEMPTS = 5
const MAX_IP_ATTEMPTS = 20

function requestIp(req) {
  const forwarded = req.headers['x-forwarded-for']
  return String(req.headers['x-real-ip'] || forwarded || 'unknown').split(',')[0].trim().slice(0, 45)
}

async function attemptCount(field, value, since) {
  const path = new URLSearchParams({
    select: 'attempt_id',
    action: 'eq.login',
    [field]: `eq.${value}`,
    created_at: `gt.${since}`,
  })
  const response = await supabaseRequest(`auth_attempts?${path}`, {
    method: 'HEAD',
    headers: { Prefer: 'count=exact', Range: '0-0' },
  })
  const countRange = response.headers.get('content-range')
  const count = Number(countRange?.split('/')[1])
  return Number.isFinite(count) ? count : 0
}

async function recordFailure(email, ip) {
  await supabaseRequest('auth_attempts', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      action: 'login',
      email: email.slice(0, 150),
      ip_address: ip,
    }),
  })
}

async function pruneOldAttempts() {
  const expiredBefore = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const query = new URLSearchParams({
    action: 'eq.login',
    created_at: `lt.${expiredBefore}`,
  })
  await supabaseRequest(`auth_attempts?${query}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  })
}

function respondError(res, status, message, code) {
  return res.status(status).json({ success: false, message, ...(code ? { code } : {}) })
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return respondError(res, 405, 'Method not allowed.')
  }

  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  const password = typeof req.body?.password === 'string' ? req.body.password : ''
  if (!email || email.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length > 256) {
    return respondError(res, 400, 'Enter a valid email address and password.')
  }

  const ip = requestIp(req)
  const since = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString()

  try {
    await pruneOldAttempts()
    const [emailAttempts, ipAttempts] = await Promise.all([
      attemptCount('email', email, since),
      attemptCount('ip_address', ip, since),
    ])
    if (emailAttempts >= MAX_EMAIL_ATTEMPTS || ipAttempts >= MAX_IP_ATTEMPTS) {
      return respondError(res, 429, `Too many attempts. Please wait ${WINDOW_MINUTES} minutes and try again.`, 'rate_limited')
    }

    const userQuery = new URLSearchParams({
      select: 'user_id,full_name,email,password_hash,role,status',
      email: `eq.${email}`,
      limit: '1',
    })
    const usersResponse = await supabaseRequest(`users?${userQuery}`)
    const users = await usersResponse.json()
    const user = users[0]

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      if (!user) {
        const pendingQuery = new URLSearchParams({
          select: 'password_hash',
          email: `eq.${email}`,
          status: 'neq.suspended',
          expires_at: `gt.${new Date().toISOString()}`,
          limit: '1',
        })
        const pendingResponse = await supabaseRequest(`pending_accounts?${pendingQuery}`)
        const pendingAccounts = await pendingResponse.json()
        if (pendingAccounts[0] && await bcrypt.compare(password, pendingAccounts[0].password_hash)) {
          await recordFailure(email, ip)
          return respondError(res, 403, 'Please verify your email before signing in.', 'email_unverified')
        }
      }

      await recordFailure(email, ip)
      return respondError(res, 401, 'Wrong email or password.')
    }

    if (user.status === 'suspended') {
      return respondError(res, 403, 'This account has been suspended. Please talk to the canteen owner.')
    }

    const verificationQuery = new URLSearchParams({
      select: 'verified_at',
      user_id: `eq.${user.user_id}`,
      limit: '1',
    })
    const verificationResponse = await supabaseRequest(`account_verifications?${verificationQuery}`)
    const verifications = await verificationResponse.json()
    if (!verifications[0] || !verifications[0].verified_at) {
      return respondError(res, 403, 'Please verify your email before signing in.', 'email_unverified')
    }

    const clearAttemptsQuery = new URLSearchParams({ action: 'eq.login', email: `eq.${email}` })
    await supabaseRequest(`auth_attempts?${clearAttemptsQuery}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    })

    setSessionCookie(res, createSessionToken(user), req.secure || req.headers['x-forwarded-proto'] === 'https')
    return res.status(200).json({
      success: true,
      user: {
        user_id: user.user_id,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
      },
    })
  } catch (error) {
    console.error('Sign-in request failed.', error)
    return respondError(res, 500, 'Sign-in is temporarily unavailable.')
  }
}
