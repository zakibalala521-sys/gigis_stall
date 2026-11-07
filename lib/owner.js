const { getAuthenticatedUser } = require('./auth')

async function getActiveOwner(req) {
  const { user, status } = await getAuthenticatedUser(req)
  if (!user) return { user: null, status }
  if (!user || user.role !== 'owner' || user.status !== 'active') {
    return { user: null, status: 403 }
  }

  return { user, status: 200 }
}

module.exports = { getActiveOwner }
