const crypto = require('node:crypto')

const SESSION_COOKIE = 'gigi_session'
const SESSION_TTL_SECONDS = 60 * 60 * 8

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('Supabase server credentials are not configured.')
  }

  return { url: new URL(url), key }
}

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET must contain at least 32 characters.')
  }
  return secret
}

async function supabaseRequest(path, options = {}) {
  const { url, key } = getSupabaseConfig()
  const endpoint = new URL(`/rest/v1/${path}`, url)
  const response = await fetch(endpoint, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  })

  if (!response.ok) {
    const error = new Error(`Supabase request failed with status ${response.status}.`)
    error.status = response.status
    throw error
  }

  return response
}

function createSessionToken(user) {
  const payload = Buffer.from(JSON.stringify({
    user: {
      user_id: user.user_id,
      full_name: user.full_name,
      email: user.email,
      role: user.role,
    },
    expires_at: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  })).toString('base64url')
  const signature = crypto.createHmac('sha256', getSessionSecret()).update(payload).digest('base64url')
  return `${payload}.${signature}`
}

function readSessionToken(token) {
  if (!token || token.length > 4096) return null

  const [payload, signature, extra] = token.split('.')
  if (!payload || !signature || extra) return null

  const expected = crypto.createHmac('sha256', getSessionSecret()).update(payload).digest()
  let actual
  try {
    actual = Buffer.from(signature, 'base64url')
  } catch {
    return null
  }

  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    const user = session.user
    if (!user || !Number.isInteger(user.user_id) || !['owner', 'vendor', 'customer'].includes(user.role)) return null
    if (!Number.isInteger(session.expires_at) || session.expires_at <= Math.floor(Date.now() / 1000)) return null
    return user
  } catch {
    return null
  }
}

function readSession(req) {
  const cookieHeader = req.headers.cookie || ''
  const cookie = cookieHeader.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`))
  if (!cookie) return null

  try {
    return readSessionToken(decodeURIComponent(cookie.slice(SESSION_COOKIE.length + 1)))
  } catch {
    return null
  }
}

function setSessionCookie(res, token, secure = process.env.NODE_ENV === 'production') {
  const secureAttribute = secure ? '; Secure' : ''
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly${secureAttribute}; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_SECONDS}`)
}

function clearSessionCookie(res, secure = process.env.NODE_ENV === 'production') {
  const secureAttribute = secure ? '; Secure' : ''
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly${secureAttribute}; SameSite=Lax; Path=/; Max-Age=0`)
}

module.exports = {
  SESSION_TTL_SECONDS,
  clearSessionCookie,
  createSessionToken,
  readSession,
  setSessionCookie,
  supabaseRequest,
}
