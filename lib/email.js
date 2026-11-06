function getEmailConfig() {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM
  const appBaseUrl = process.env.APP_BASE_URL

  if (!apiKey || !from || !appBaseUrl) {
    throw new Error('Email delivery is not configured.')
  }

  const sender = /^.+<([^<>]+)>$/.exec(from)
  const senderEmail = sender ? sender[1] : from
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(senderEmail)) {
    throw new Error('EMAIL_FROM must contain a valid sender email address.')
  }

  const appUrl = new URL(appBaseUrl)
  if (
    !['http:', 'https:'].includes(appUrl.protocol)
    || appUrl.username
    || appUrl.password
    || appUrl.search
    || appUrl.hash
  ) {
    throw new Error('APP_BASE_URL must be a valid application URL.')
  }

  return { apiKey, from, appUrl }
}

async function sendVerificationEmail(email, name, token) {
  const { apiKey, from, appUrl } = getEmailConfig()
  const verificationUrl = new URL('/', appUrl)
  verificationUrl.hash = new URLSearchParams({ verify: token }).toString()
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Verify your Gigi's Food House account",
      text: `Hi ${name},\n\nVerify your email address to activate your account:\n${verificationUrl}\n\nThis link expires in 24 hours. If you did not create an account, you can ignore this email.`,
    }),
  })

  if (!response.ok) {
    console.error(`Verification email provider rejected the request with status ${response.status}.`)
    throw new Error('The verification email could not be sent. Check the email configuration and try again.')
  }
}

module.exports = { sendVerificationEmail }
