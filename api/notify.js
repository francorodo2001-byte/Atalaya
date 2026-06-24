// Vercel Cron: runs every hour. Checks tasks due in <24h and sends WhatsApp via Twilio.
export default async function handler(req, res) {
  // Allow Vercel Cron (GET with Authorization header) or direct POST
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.authorization || '';
    if (auth !== `Bearer ${cronSecret}`) return res.status(401).json({ error: 'unauthorized' });
  }

  const { SUPABASE_URL, SUPABASE_ANON_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
          TWILIO_WHATSAPP_FROM, TWILIO_WHATSAPP_TO } = process.env;

  if (!SUPABASE_URL || !TWILIO_ACCOUNT_SID) {
    return res.json({ ok: false, msg: 'env vars missing' });
  }

  // Query tasks due in next 24h that are NOT "entregado" and haven't been notified
  const now   = new Date();
  const plus24 = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const from   = now.toISOString();
  const to     = plus24.toISOString();

  const qRes = await fetch(
    `${SUPABASE_URL}/rest/v1/tasks?select=*&status=neq.entregado&whatsapp_notified=eq.false&due_date=gte.${from}&due_date=lte.${to}`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
  );
  const tasks = await qRes.json();
  if (!Array.isArray(tasks) || tasks.length === 0) return res.json({ ok: true, sent: 0 });

  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
  const auth64    = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');

  let sent = 0;
  const notifiedIds = [];

  for (const t of tasks) {
    const due = new Date(t.due_date);
    const dueStr = due.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const body = `⚠️ *Tarea por vencer*\n📋 ${t.title}\n👤 ${t.assignee || '—'}\n📅 Vence: ${dueStr}`;
    try {
      await fetch(twilioUrl, {
        method: 'POST',
        headers: { Authorization: `Basic ${auth64}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ From: TWILIO_WHATSAPP_FROM, To: TWILIO_WHATSAPP_TO, Body: body }),
      });
      notifiedIds.push(t.id);
      sent++;
    } catch { /* skip individual failure */ }
  }

  // Mark tasks as notified
  if (notifiedIds.length > 0) {
    await fetch(`${SUPABASE_URL}/rest/v1/tasks?id=in.(${notifiedIds.join(',')})`, {
      method: 'PATCH',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
                 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ whatsapp_notified: true }),
    });
  }

  return res.json({ ok: true, sent });
}
