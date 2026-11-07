require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const loginHandler = require('../api/auth/login');
const registerHandler = require('../api/auth/register');
const verifyEmailHandler = require('../api/auth/verify-email');
const sessionHandler = require('../api/auth/session');
const logoutHandler = require('../api/auth/logout');
const dashboardHandler = require('../api/admin/dashboard');
const adminMenuHandler = require('../api/admin/menu');
const ordersHandler = require('../api/orders');
const adminOrdersHandler = require('../api/admin/orders');
const resetPasswordHandler = require('../api/auth/reset-password');

const app = express();
const port = Number(process.env.PORT || 3001);
const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

app.use(cors({ origin: clientOrigin, credentials: true }));
app.use(express.json({ limit: '3mb' }));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'gigisfoodstall-server' });
});

app.post('/api/auth/login', loginHandler);
app.post('/api/auth/register', registerHandler);
app.post('/api/auth/verify-email', verifyEmailHandler);
app.get('/api/auth/session', sessionHandler);
app.post('/api/auth/logout', logoutHandler);
app.get('/api/admin/dashboard', dashboardHandler);
app.get('/api/admin/menu', adminMenuHandler);
app.post('/api/admin/menu', adminMenuHandler);
app.patch('/api/admin/menu', adminMenuHandler);
app.delete('/api/admin/menu', adminMenuHandler);
app.get('/api/orders', ordersHandler);
app.post('/api/orders', ordersHandler);
app.patch('/api/orders', ordersHandler);
app.get('/api/admin/orders', adminOrdersHandler);
app.post('/api/admin/orders', adminOrdersHandler);
app.patch('/api/admin/orders', adminOrdersHandler);
app.delete('/api/admin/orders', adminOrdersHandler);
app.post('/api/auth/reset-password', resetPasswordHandler);

app.get('/api/menu', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('product_id, category_id, name, description, unit, price, image, is_available, categories(name)')
      .eq('is_archived', 0)
      .order('name');

    if (error) {
      return next(error);
    }

    res.json({ success: true, products: data });
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({
    success: false,
    message: 'The server could not complete the request.'
  });
});

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
