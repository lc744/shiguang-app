(async () => {
  const out = {};
  const raw = localStorage.getItem('shiguang_user');
  out.userRaw = raw ? String(raw).slice(0, 220) : 'none';
  try{ const r = await shareApi('adminCheck', {}); out.resp = JSON.stringify(r).slice(0, 200); }
  catch(e){ out.err = String(e && e.message || e).slice(0, 200); }
  out.adminMode = (typeof adminMode !== 'undefined') ? adminMode : 'u';
  return JSON.stringify(out);
})()
