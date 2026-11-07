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

function getBearerToken(req) {
  const authorization = req.headers.authorization || ''
  const match = /^Bearer\s+(.+)$/i.exec(authorization)
  return match?.[1] || null
}

async function findProfile(filters) {
  const query = new URLSearchParams({
    select: 'user_id,auth_user_id,full_name,email,role,status',
    ...filters,
    limit: '1',
  })
  const response = await supabaseRequest(`users?${query}`)
  const users = await response.json()
  return users[0] || null
}

async function getAuthenticatedUser(req) {
  const accessToken = getBearerToken(req)
  if (!accessToken) return { user: null, status: 401 }

  const { url } = getSupabaseConfig()
  const publicKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!publicKey) throw new Error('SUPABASE_ANON_KEY is required to validate Supabase Auth sessions.')

  const authResponse = await fetch(new URL('/auth/v1/user', url), {
    headers: {
      apikey: publicKey,
      Authorization: `Bearer ${accessToken}`,
    },
  })
  if (!authResponse.ok) {
    if (authResponse.status === 401 || authResponse.status === 403) return { user: null, status: 401 }
    const error = new Error(`Supabase Auth user lookup failed with status ${authResponse.status}.`)
    error.status = authResponse.status
    throw error
  }

  const authUser = await authResponse.json()
  const email = typeof authUser.email === 'string' ? authUser.email.trim().toLowerCase() : ''
  if (!authUser.id || !email || !authUser.email_confirmed_at) return { user: null, status: 403 }

  let profile = await findProfile({ auth_user_id: `eq.${authUser.id}` })
  if (!profile) {
    const emailProfile = await findProfile({ email: `eq.${email}` })
    if (emailProfile) {
      if (emailProfile.auth_user_id && emailProfile.auth_user_id !== authUser.id) {
        return { user: null, status: 409 }
      }
      if (emailProfile.status !== 'active') return { user: null, status: 403 }

      const linkQuery = new URLSearchParams({
        user_id: `eq.${emailProfile.user_id}`,
        auth_user_id: 'is.null',
        select: 'user_id,auth_user_id,full_name,email,role,status',
      })
      const linkedResponse = await supabaseRequest(`users?${linkQuery}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ auth_user_id: authUser.id }),
      })
      const linkedProfiles = await linkedResponse.json()
      profile = linkedProfiles[0] || await findProfile({ auth_user_id: `eq.${authUser.id}` })
      if (!profile) return { user: null, status: 409 }
    } else {
      const fullName = typeof authUser.user_metadata?.full_name === 'string'
        ? authUser.user_metadata.full_name.trim().slice(0, 100)
        : ''
      try {
        const createdResponse = await supabaseRequest('users?select=user_id,auth_user_id,full_name,email,role,status', {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({
            auth_user_id: authUser.id,
            full_name: fullName || email.split('@')[0].slice(0, 100),
            email,
            password_hash: null,
            role: 'customer',
            status: 'active',
          }),
        })
        const createdProfiles = await createdResponse.json()
        profile = createdProfiles[0]
      } catch (error) {
        if (error.status !== 409) throw error
      }
      profile ||= await findProfile({ auth_user_id: `eq.${authUser.id}` })
      if (!profile) return { user: null, status: 409 }
    }
  }

  if (profile.email.toLowerCase() !== email || profile.status !== 'active') {
    return { user: null, status: 403 }
  }
  return { user: profile, status: 200 }
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
  getAuthenticatedUser,
  readSession,
  setSessionCookie,
  supabaseRequest,
}
