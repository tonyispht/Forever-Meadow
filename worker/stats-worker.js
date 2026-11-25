// Forever Meadow: anonymous, aggregate stats only. No names, photos, notes or dates are ever received.
const H = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization', 'Access-Control-Max-Age': '86400' };
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...H, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const ACT = /^(treat|toy|love|mode|share|photo|candle|install|export|import|memorial):?[a-z0-9_-]{0,24}$/;
const VID = /^[a-zA-Z0-9-]{8,64}$/;
const SPECIES = new Set(['dog', 'cat']);

function eq(a, b) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
const day = (t) => new Date(t).toISOString().slice(0, 10);

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: H });
    if (url.pathname === '/e' && req.method === 'POST') return collect(req, env);
    if (url.pathname === '/stats' && req.method === 'GET') return stats(req, env);
    return json({ ok: true, service: 'forever-meadow-stats' });
  },
};

async function collect(req, env) {
  let b; try { const t = await req.text(); if (t.length > 1000) return json({ ok: false }, 413); b = JSON.parse(t); } catch { return json({ ok: false }, 400); }
  if (!b || !VID.test(b.v || '')) return json({ ok: false }, 400);
  const DB = env.DB, now = Date.now(), d = day(now), v = b.v, country = (req.cf && req.cf.country) || null;
  const bump = (k) => DB.prepare('INSERT INTO counters(day,key,n) VALUES(?,?,1) ON CONFLICT(day,key) DO UPDATE SET n=n+1').bind(d, k);
  const row = await DB.prepare('SELECT last_seen, pet_created FROM visitors WHERE vid=?').bind(v).first();
  const st = [];
  if (!row) {
    st.push(DB.prepare('INSERT INTO visitors(vid,first_seen,last_seen,last_ping,visits,pings,country) VALUES(?,?,?,0,1,0,?)').bind(v, now, now, country), bump('new'), bump('visit'));
  }
  if (b.t === 'hello') {
    if (row) {
      if (now - row.last_seen > 1800000) st.push(DB.prepare('UPDATE visitors SET last_seen=?, visits=visits+1, country=COALESCE(?,country) WHERE vid=?').bind(now, country, v), bump('visit'));
      else st.push(DB.prepare('UPDATE visitors SET last_seen=? WHERE vid=?').bind(now, v));
    }
  } else if (b.t === 'create') {
    const sp = SPECIES.has(b.species) ? b.species : null, br = /^[a-z0-9_-]{1,24}$/.test(b.breed || '') ? b.breed : null;
    st.push(DB.prepare('UPDATE visitors SET species=?, breed=?, last_seen=?, pet_created=COALESCE(pet_created,?) WHERE vid=?').bind(sp, br, now, now, v));
    if (!row || !row.pet_created) st.push(bump('created'));
  } else if (b.t === 'ping') {
    st.push(DB.prepare('UPDATE visitors SET last_ping=?, last_seen=?, pings=pings+1 WHERE vid=?').bind(now, now, v));
  } else if (b.t === 'act' && typeof b.k === 'string' && ACT.test(b.k)) {
    st.push(bump(b.k));
  }
  if (st.length) await DB.batch(st);
  return json({ ok: true });
}

async function stats(req, env) {
  const auth = req.headers.get('Authorization') || '';
  const tok = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!env.ADMIN_TOKEN || !eq(tok, env.ADMIN_TOKEN)) return json({ error: 'unauthorized' }, 401);
  const DB = env.DB, now = Date.now(), H1 = 3600000, D = 24 * H1;
  const [tot, sp, br, co, ser, acts, hrs] = await DB.batch([
    DB.prepare('SELECT COUNT(*) visitors, SUM(pet_created IS NOT NULL) pets, SUM(visits>1) repeat_visitors, SUM(last_ping>?) online, SUM(last_seen>?) a24, SUM(last_seen>?) a7, SUM(last_seen>?) a30, SUM(first_seen>?) new24, SUM(pet_created>?) created24, SUM(pings) pings, SUM(pings>0) players FROM visitors').bind(now - 75000, now - D, now - 7 * D, now - 30 * D, now - D, now - D),
    DB.prepare('SELECT species k, COUNT(*) n FROM visitors WHERE species IS NOT NULL GROUP BY species'),
    DB.prepare("SELECT species||':'||breed k, COUNT(*) n FROM visitors WHERE species IS NOT NULL AND breed IS NOT NULL GROUP BY 1 ORDER BY n DESC LIMIT 15"),
    DB.prepare('SELECT country k, COUNT(*) n FROM visitors WHERE country IS NOT NULL GROUP BY country ORDER BY n DESC LIMIT 10'),
    DB.prepare("SELECT day, key, n FROM counters WHERE day>=? AND key IN ('visit','new','created') ORDER BY day").bind(day(now - 29 * D)),
    DB.prepare("SELECT key k, SUM(n) n FROM counters WHERE key NOT IN ('visit','new','created') GROUP BY key ORDER BY n DESC LIMIT 120"),
    DB.prepare('SELECT CAST((last_ping/3600000) AS INTEGER) h, COUNT(*) n FROM visitors WHERE last_ping>? GROUP BY h ORDER BY h').bind(now - 24 * H1),
  ]);
  return json({ now, totals: tot.results[0], species: sp.results, breeds: br.results, countries: co.results, series: ser.results, acts: acts.results, active_hours: hrs.results });
}
