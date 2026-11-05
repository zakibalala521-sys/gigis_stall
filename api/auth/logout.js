const { clearSessionCookie } = require('../../lib/auth')

module.exports = function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ success: false, message: 'Method not allowed.' })
  }

  clearSessionCookie(res, req.secure || req.headers['x-forwarded-proto'] === 'https')
  return res.status(200).json({ success: true })
}
