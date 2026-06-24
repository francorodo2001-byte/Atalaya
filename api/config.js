export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  if (req.method === 'OPTIONS') return res.status(204).end();
  res.json({
    supabaseUrl:      process.env.SUPABASE_URL      || '',
    supabaseAnonKey:  process.env.SUPABASE_ANON_KEY || '',
  });
}
