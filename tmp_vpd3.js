(async () => {
  const data = await window.__listVoicePacks();
  const pack = (data.packs || []).find(p => p.id === 'kokoro-cn');
  if(!pack) return JSON.stringify({ err: 'no kokoro pack' });
  if(pack.installed) return JSON.stringify({ err: 'already installed', sizeMB: Math.round((pack.installedBytes||0)/1048576) });
  window.__vpTest = { phases: [], last: null, done: false, err: null };
  window.__downloadVoicePack(pack).then(() => { window.__vpTest.done = true; window.__vpTest.last = 'resolve'; }).catch(e => { window.__vpTest.done = true; window.__vpTest.err = String(e && e.message || e).slice(0, 150); });
  return JSON.stringify({ started: true });
})()
