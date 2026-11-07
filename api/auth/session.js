const { getAuthenticatedUser } = require('../../lib/auth')

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ success: false, message: 'Method not allowed.' })
  }

  try {
    const result = await getAuthenticatedUser(req)
    if (!result.user && result.status === 401) {
      return res.status(200).json({ success: true, authenticated: false, user: null })
    }
    if (!result.user) {
      return res.status(result.status).json({ success: false, message: 'Could not load the authenticated account.' })
    }
    return res.status(200).json({
      success: true,
      authenticated: true,
      user: {
        user_id: result.user.user_id,
        full_name: result.user.full_name,
        email: result.user.email,
        role: result.user.role,
      },
    })
  } catch (error) {
    console.error('Session validation failed.', error)
    return res.status(500).json({ success: false, message: 'Could not verify the sign-in session.' })
  }
}
