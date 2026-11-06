module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ success: false, message: 'Method not allowed.' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('SUPABASE_URL and a Supabase server key must be configured.');
    return res.status(500).json({ success: false, message: 'The menu service is not configured.' });
  }

  const endpoint = new URL('/rest/v1/products', supabaseUrl);
  endpoint.search = new URLSearchParams({
    select: 'product_id,category_id,name,description,unit,price,image,is_available,categories(name)',
    is_archived: 'eq.0',
    order: 'name',
  }).toString();

  try {
    const response = await fetch(endpoint, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    });

    if (!response.ok) {
      console.error(`Supabase menu request failed with status ${response.status}.`);
      return res.status(502).json({ success: false, message: 'Could not load the menu from Supabase.' });
    }

    const products = await response.json();
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ success: true, products });
  } catch (error) {
    console.error('Supabase menu request failed.', error);
    return res.status(502).json({ success: false, message: 'Could not load the menu from Supabase.' });
  }
};
