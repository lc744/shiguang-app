// 触发 kokoro-cn 下载，挂进度收集器（不 await，稍后轮询）
(async () => {
  const data = await window.__listVoicePacks();
  const pack = (data.packs || []).find(p => p.id === 'kokoro-cn');
  if(!pack) return JSON.stringify({ err: 'no kokoro pack' });
  if(pack.installed) return JSON.stringify({ err: 'already installed' });
  window.__vpTest = { phases: [], last: null, done: false, err: null };
  const orig = window.__onVoiceProgress;
  window.__onVoiceProgress = (d) => {
    if(!d || d.id !== 'kokoro-cn') return;
    window.__vpTest.last = d.phase + ':' + Math.round((d.received||0)/1048576) + 'MB/' + Math.round((d.total||0)/1048576) + 'MB';
    if(window.__vpTest.phases[window.__vpTest.phases.length-1] !== d.phase) window.__vpTest.phases.push(d.phase);
    if(d.phase === 'done'){ window.__vpTest.done = true; window.__onVoiceProgress = orig; }
  };
  window.__downloadVoicePack(pack).then(() => {
    window.__vpTest.done = true;
    window.__vpTest.last = 'resolve';
  }).catch(e => {
    window.__vpTest.done = true;
    window.__vpTest.err = String(e && e.message || e).slice(0, 150);
  });
  return JSON.stringify({ started: true, url: (pack.downloadUrl||'').slice(0, 70) });
})()
