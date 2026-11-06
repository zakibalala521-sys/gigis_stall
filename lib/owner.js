const { readSession, supabaseRequest } = require('./auth')

async function getActiveOwner(req) {
  const sessionUser = readSession(req)
  if (!sessionUser) return { user: null, status: 401 }
  if (sessionUser.role !== 'owner') return { user: null, status: 403 }

  const query = new URLSearchParams({
    select: 'user_id,role,status',
    user_id: `eq.${sessionUser.user_id}`,
    limit: '1',
  })
  const response = await supabaseRequest(`users?${query}`)
  const users = await response.json()
  const user = users[0]
  if (!user || user.role !== 'owner' || user.status !== 'active') {
    return { user: null, status: 403 }
  }

  return { user, status: 200 }
}

module.exports = { getActiveOwner }
