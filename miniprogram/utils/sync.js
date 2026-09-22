// 绸缪 · 事件云同步层（对齐设计：镜像 + 实时，最后修改时间赢）
// 归属：openid（云函数上下文）；云端 eventSync 集合 _id=事件id 幂等 upsert
// 合并规则：先 push 本地全部 → pull 云端 → 云端有本地无=他端新增→入本地；
//          两边都有=updatedAt 大者覆盖本地字段（本地独有资源 voiceData 始终保留）
const store = require('./store');

let _dirtyTimer = null;
let _syncing = false;

function hasCloud(){
  return !!(wx.cloud && wx.cloud.callFunction);
}

function readIdentity(){
  try{ return wx.getStorageSync('shiguang_share_identity') || {}; }catch(e){ return {}; }
}

// 合并云端事件到本地：返回合并后的事件数组（不含 voiceData 丢失问题——云端文档本就没有该字段）
function mergeCloud(cloudEvents){
  const local = store.getEvents();
  const byId = {};
  local.forEach(e => { byId[e.id] = e; });
  let added = 0, updated = 0;
  (cloudEvents || []).forEach(cd => {
    if(!cd || !cd.id) return;
    const e = Object.assign({}, cd);
    delete e._id;          // 云库文档 id
    delete e.owner;        // 归属字段不进本地模型
    const cur = byId[e.id];
    if(!cur){
      // 他端新增：语音资源不在云端，缺省置空（本地响铃兜底走系统音）
      if(!('voiceData' in e)) e.voiceData = '';
      byId[e.id] = e;
      added++;
    } else {
      const cT = Number(e.updatedAt) || 0;
      const lT = Number(cur.updatedAt) || 0;
      if(cT > lT){
        // 云端更新：覆盖字段但保留本地语音数据
        const merged = Object.assign({}, e, { voiceData: cur.voiceData || '' });
        byId[e.id] = merged;
        updated++;
      } else {
        // 本地更新或持平：仅确保 updatedAt 有值
        if(!lT){ cur.updatedAt = Date.now(); }
      }
    }
  });
  const merged = Object.keys(byId).map(k => byId[k]);
  return { events: merged, added, updated };
}

// 完整同步：push 本地全部 → pull 合并。静默失败，绝不打扰用户。
async function syncNow(){
  if(_syncing || !hasCloud()) return;
  _syncing = true;
  try{
    // 1) push 本地全部（云端按 updatedAt 幂等取舍）
    await wx.cloud.callFunction({
      name: 'syncEvent',
      data: { action: 'pushAll', events: JSON.parse(JSON.stringify(store.getEvents())) }
    }).then(r => r.result);
    // 2) pull 云端并合并
    const r2 = await wx.cloud.callFunction({ name: 'syncEvent', data: { action: 'pullAll' } });
    const out = r2 && r2.result;
    if(out && out.ok && Array.isArray(out.events)){
      const m = mergeCloud(out.events);
      if(m.added || m.updated){
        // raw 写入：不触发 markDirty，防止同步循环
        store.setEventsRaw(m.events);
      }
    }
  }catch(e){ /* 静默：网络/云不可用时保持本地 */ }
  finally{ _syncing = false; }
}

// 变更标记：3 秒防抖后执行一次完整同步（保存/删除/完成都会调用）
function markDirty(){
  if(!hasCloud()) return;
  if(_dirtyTimer){ clearTimeout(_dirtyTimer); }
  _dirtyTimer = setTimeout(() => { _dirtyTimer = null; syncNow(); }, 3000);
}

// 删除事件时同步删除云端镜像（否则 pull 会把已删事件拉回来）
function delEvent(id){
  if(!hasCloud() || !id) return;
  wx.cloud.callFunction({ name: 'syncEvent', data: { action: 'delOne', eventId: id } }).catch(() => {});
}

module.exports = { syncNow, markDirty, delEvent };
