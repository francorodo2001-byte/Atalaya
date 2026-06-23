// /api/accounts.js
const META_API_VERSION = 'v19.0';
const META_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const META_TOKEN = process.env.META_TOKEN;
  const AD_ACCOUNTS = (process.env.AD_ACCOUNTS || '').split(',').map(s => s.trim()).filter(Boolean);

  if (!META_TOKEN) return res.status(500).json({ error: 'META_TOKEN no configurado' });
  if (AD_ACCOUNTS.length === 0) return res.status(500).json({ error: 'AD_ACCOUNTS no configurado' });

  try {
    const results = await Promise.allSettled(
      AD_ACCOUNTS.map(id => fetchAccountData(id, META_TOKEN))
    );
    const clients = results
      .filter(r => r.status === 'fulfilled' && r.value)
      .map(r => r.value);
    const errors = results
      .filter(r => r.status === 'rejected')
      .map((r, i) => ({ account: AD_ACCOUNTS[i], error: r.reason?.message || 'error desconocido' }));

    return res.status(200).json({ ok: true, timestamp: Date.now(), clients, errors });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function metaFetch(path, params, token) {
  const url = new URL(`${META_BASE}${path}`);
  Object.entries(params || {}).forEach(([k, v]) => url.searchParams.set(k, v));
  url.searchParams.set('access_token', token);
  const r = await fetch(url.toString());
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error?.message || `HTTP ${r.status}`);
  }
  return r.json();
}

async function fetchAccountData(id, token) {
  const acct = await metaFetch(`/act_${id}`, {
    fields: 'name,currency,account_status,balance,amount_spent,spend_cap,business_name,disable_reason',
  }, token);

  const camps = await metaFetch(`/act_${id}/campaigns`, {
    fields: 'name,objective,status,daily_budget,lifetime_budget,insights.date_preset(today){spend,actions,action_values,cost_per_action_type,purchase_roas}',
    limit: 50,
  }, token);

  const campaigns = (camps.data || []).map(ca => {
    const ci = ca.insights?.data?.[0] || {};
    const cspend = parseFloat(ci.spend || 0);
    const croas = parseFloat(ci.purchase_roas?.[0]?.value || 0);
    const purchases = (ci.actions || []).find(a => a.action_type === 'purchase')?.value || 0;
    const results = parseInt(purchases) || (ci.actions?.[0]?.value ? parseInt(ci.actions[0].value) : 0);
    return {
      id: ca.id, name: ca.name, objective: ca.objective,
      status: ca.status === 'ACTIVE' ? 'active' : 'paused',
      dailyBudget: parseFloat(ca.daily_budget || 0) / 100,
      spend: cspend, revenue: cspend * croas, roas: croas,
      cpr: results > 0 ? cspend / results : 0, results,
    };
  });

  const balance = parseFloat(acct.balance || 0) / 100;
  const amountSpent = parseFloat(acct.amount_spent || 0) / 100;
  const spendCap = parseFloat(acct.spend_cap || 0) / 100;
  const status = acct.account_status === 1 ? 'active' : acct.account_status === 2 ? 'disabled' : 'paused';

  const alerts = [];
  if (status === 'disabled') {
    alerts.push({ level: 'bad', title: 'Cuenta deshabilitada', msg: acct.disable_reason || 'Meta deshabilitó la cuenta.' });
  }
  if (balance < 0) {
    alerts.push({ level: balance < -100 ? 'bad' : 'warn', title: 'Saldo en contra', msg: `Debe ${acct.currency} ${Math.abs(balance).toFixed(2)}` });
  }
  const activeC = campaigns.filter(c => c.status === 'active');
  const accSpend = activeC.reduce((s, c) => s + c.spend, 0);
  const accRev = activeC.reduce((s, c) => s + c.revenue, 0);
  const accRoas = accSpend ? accRev / accSpend : 0;
  if (accRoas > 0 && accRoas < 1 && status === 'active') {
    alerts.push({ level: 'warn', title: 'ROAS bajo 1×', msg: `Promedio ${accRoas.toFixed(2)}× · pérdida operativa` });
  }
  if (spendCap && amountSpent > spendCap * 0.85) {
    alerts.push({ level: 'info', title: 'Cerca del spend cap', msg: `${((amountSpent / spendCap) * 100).toFixed(0)}% del límite` });
  }

  return {
    id: `act_${id}`, name: acct.business_name || acct.name,
    status, currency: acct.currency, balance, amountSpent,
    spendLimit: spendCap, lastUpdate: Date.now(), campaigns, alerts,
  };
}
