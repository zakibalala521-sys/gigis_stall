const { readSession } = require('../../lib/auth')

module.exports = function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ success: false, message: 'Method not allowed.' })
  }

  try {
    const user = readSession(req)
    return res.status(200).json({ success: true, authenticated: Boolean(user), user })
  } catch (error) {
    console.error('Session validation failed.', error)
    return res.status(500).json({ success: false, message: 'Could not verify the sign-in session.' })
  }
}
