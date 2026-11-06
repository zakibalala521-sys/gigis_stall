const crypto = require('node:crypto')
const bcrypt = require('bcryptjs')
const { supabaseRequest } = require('../../lib/auth')

function respond(res, status, body) {
  res.setHeader('Cache-Control', 'no-store')
  return res.status(status).json(body)
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return respond(res, 405, { success: false, message: 'Method not allowed.' })
  }

  const expectedToken = process.env.TEMP_PASSWORD_RESET_TOKEN
  const accountEmail = process.env.TEMP_PASSWORD_RESET_EMAIL?.trim().toLowerCase()
  const authorization = req.headers.authorization || ''
  const suppliedToken = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : ''

  if (!expectedToken || expectedToken.length < 32 || !accountEmail) {
    return respond(res, 503, { success: false, message: 'Temporary password reset is not enabled.' })
  }

  const expected = Buffer.from(expectedToken)
  const supplied = Buffer.from(suppliedToken)
  if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) {
    return respond(res, 401, { success: false, message: 'Unauthorized.' })
  }

  const newPassword = req.body?.newPassword
  if (
    typeof newPassword !== 'string'
    || newPassword.length < 12
    || Buffer.byteLength(newPassword, 'utf8') > 72
  ) {
    return respond(res, 400, {
      success: false,
      message: 'Choose a password with at least 12 characters and no more than 72 UTF-8 bytes.',
    })
  }

  try {
    const lookup = new URLSearchParams({
      select: 'user_id',
      email: `eq.${accountEmail}`,
      limit: '2',
    })
    const usersResponse = await supabaseRequest(`users?${lookup}`)
    const users = await usersResponse.json()

    if (users.length !== 1) {
      return respond(res, 404, { success: false, message: 'The configured account was not found uniquely.' })
    }

    const passwordHash = await bcrypt.hash(newPassword, 12)
    const update = new URLSearchParams({
      user_id: `eq.${users[0].user_id}`,
      select: 'user_id',
    })
    const updateResponse = await supabaseRequest(`users?${update}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ password_hash: passwordHash }),
    })
    const updatedUsers = await updateResponse.json()

    if (updatedUsers.length !== 1) {
      console.error('Temporary password reset did not update exactly one account.')
      return respond(res, 500, { success: false, message: 'Could not change the password.' })
    }

    return respond(res, 200, { success: true, message: 'Password changed. Disable the temporary reset endpoint now.' })
  } catch (error) {
    console.error('Temporary password reset failed.', error)
    return respond(res, 500, { success: false, message: 'Could not change the password.' })
  }
}
