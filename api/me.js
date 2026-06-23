// /api/me.js
// Verifica si el usuario está autenticado leyendo la cookie.

export default async function handler(req, res) {
  const cookie = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('atalaya_auth='));
  const token = cookie ? cookie.split('=')[1] : null;
  if (token && token === process.env.APP_PASSWORD) {
    return res.status(200).json({ authenticated: true });
  }
  return res.status(401).json({ authenticated: false });
}
