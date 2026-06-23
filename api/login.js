// /api/login.js
// Login simple por contraseña compartida. Setea cookie httpOnly por 7 días.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const { password } = body || {};

  if (!password || password !== process.env.APP_PASSWORD) {
    // Pequeño delay para evitar brute force trivial
    await new Promise(r => setTimeout(r, 500));
    return res.status(401).json({ error: 'Contraseña incorrecta' });
  }

  // Cookie segura, httpOnly, 7 días
  const maxAge = 7 * 24 * 60 * 60; // segundos
  res.setHeader(
    'Set-Cookie',
    `atalaya_auth=${process.env.APP_PASSWORD}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`
  );
  return res.status(200).json({ ok: true });
}
