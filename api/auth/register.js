const bcrypt = require('bcryptjs')
const crypto = require('node:crypto')
const { supabaseRequest } = require('../../lib/auth')
const { sendVerificationEmail } = require('../../lib/email')

const REGISTRATION_WINDOW_MINUTES = 60
const MAX_EMAIL_ATTEMPTS = 3
const MAX_IP_ATTEMPTS = 5
const VERIFICATION_TTL_HOURS = 24

function respond(res, status, body) {
  res.setHeader('Cache-Control', 'no-store')
  return res.status(status).json(body)
}

function requestIp(req) {
  const forwarded = req.headers['x-forwarded-for']
  return String(req.headers['x-real-ip'] || forwarded || 'unknown').split(',')[0].trim().slice(0, 45)
}

async function countAttempts(field, value, since) {
  const query = new URLSearchParams({
    select: 'attempt_id',
    action: 'eq.register',
    [field]: `eq.${value}`,
    created_at: `gt.${since}`,
  })
  const response = await supabaseRequest(`auth_attempts?${query}`, {
    method: 'HEAD',
    headers: { Prefer: 'count=exact', Range: '0-0' },
  })
  return Number(response.headers.get('content-range')?.split('/')[1])
}

function validEmail(email) {
  return email.length <= 150 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function validPassword(password) {
  return password.length >= 8
    && Buffer.byteLength(password, 'utf8') <= 72
    && /[a-z]/.test(password)
    && /[A-Z]/.test(password)
    && /[0-9]/.test(password)
    && /[^A-Za-z0-9\s]/.test(password)
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return respond(res, 405, { success: false, message: 'Method not allowed.' })
  }

  const fullName = typeof req.body?.full_name === 'string' ? req.body.full_name.trim() : ''
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  const password = typeof req.body?.password === 'string' ? req.body.password : ''

  if (!fullName || fullName.length > 100) {
    return respond(res, 400, { success: false, message: 'Enter your full name (up to 100 characters).' })
  }
  if (!validEmail(email)) {
    return respond(res, 400, { success: false, message: 'Enter a valid email address.' })
  }
  if (!validPassword(password)) {
    return respond(res, 400, {
      success: false,
      message: 'Password must be at least 8 characters and include a lowercase letter, an uppercase letter, a number, and a special character.',
    })
  }

  try {
    const ip = requestIp(req)
    const since = new Date(Date.now() - REGISTRATION_WINDOW_MINUTES * 60 * 1000).toISOString()
    const [emailAttempts, ipAttempts] = await Promise.all([
      countAttempts('email', email, since),
      countAttempts('ip_address', ip, since),
    ])
    if (
      !Number.isFinite(emailAttempts)
      || !Number.isFinite(ipAttempts)
    ) {
      throw new Error('Could not check the registration rate limit.')
    }
    if (emailAttempts >= MAX_EMAIL_ATTEMPTS || ipAttempts >= MAX_IP_ATTEMPTS) {
      return respond(res, 429, { success: false, message: 'Too many registration attempts. Please wait an hour and try again.' })
    }

    await supabaseRequest('auth_attempts', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ action: 'register', email, ip_address: ip }),
    })
    const expiryCleanup = new URLSearchParams({ expires_at: `lt.${new Date().toISOString()}` })
    await supabaseRequest(`pending_accounts?${expiryCleanup}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    })

    const existingQuery = new URLSearchParams({ select: 'user_id', email: `eq.${email}`, limit: '1' })
    const pendingQuery = new URLSearchParams({ select: 'pending_id', email: `eq.${email}`, limit: '1' })
    const [usersResponse, pendingResponse] = await Promise.all([
      supabaseRequest(`users?${existingQuery}`),
      supabaseRequest(`pending_accounts?${pendingQuery}`),
    ])
    const [users, pendingAccounts] = await Promise.all([usersResponse.json(), pendingResponse.json()])
    if (users.length || pendingAccounts.length) {
      return respond(res, 409, {
        success: false,
        message: users.length ? 'An account already uses this email.' : 'A signup for this email is already waiting for verification. Check your inbox.',
      })
    }

    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + VERIFICATION_TTL_HOURS * 60 * 60 * 1000).toISOString()
    let pendingId

    try {
      const pendingResponse = await supabaseRequest('pending_accounts?select=pending_id', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          full_name: fullName,
          email,
          password_hash: await bcrypt.hash(password, 12),
          role: 'customer',
          status: 'active',
          expires_at: expiresAt,
        }),
      })
      const pending = await pendingResponse.json()
      if (pending.length !== 1) throw new Error('The pending account was not created.')
      pendingId = pending[0].pending_id

      await supabaseRequest('pending_account_tokens', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          pending_id: pendingId,
          token_hash: crypto.createHash('sha256').update(token).digest('hex'),
          expires_at: expiresAt,
        }),
      })
      await sendVerificationEmail(email, fullName, token)
    } catch (error) {
      if (pendingId !== undefined) {
        try {
          await supabaseRequest(`pending_accounts?${new URLSearchParams({ pending_id: `eq.${pendingId}` })}`, {
            method: 'DELETE',
            headers: { Prefer: 'return=minimal' },
          })
        } catch (cleanupError) {
          console.error('Could not clean up an incomplete pending signup.', cleanupError)
        }
      }
      throw error
    }

    return respond(res, 201, {
      success: true,
      message: 'Signup received. Check your email and verify your address before signing in.',
    })
  } catch (error) {
    console.error('Customer registration failed.', error)
    if (error.status === 409) {
      return respond(res, 409, { success: false, message: 'An account or signup already uses this email.' })
    }
    if (error.message.includes('Email delivery is not configured') || error.message.includes('EMAIL_FROM') || error.message.includes('APP_BASE_URL')) {
      return respond(res, 503, { success: false, message: 'Account signup email is not configured yet. Please contact the site owner.' })
    }
    if (error.message.includes('verification email could not be sent')) {
      return respond(res, 503, { success: false, message: error.message })
    }
    return respond(res, 500, { success: false, message: 'Could not create the account. Please try again later.' })
  }
}
