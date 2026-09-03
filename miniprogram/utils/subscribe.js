// 绸缪小程序 · 订阅消息客户端桥
// 职责：①保存/删除/完成事件时把最小字段同步到云端（推送数据源）
//      ②保存事件（用户手势路径）时请求一次订阅授权
// 全链路静默降级：模板未配置 / 云开发未开通 / 调用失败，都不影响本地功能
const cfg = require('./config');

function hasCloud(){
  try{ return !!(wx.cloud && typeof wx.cloud.callFunction === 'function'); }catch(e){ return false; }
}

// 推送功能是否已配置启用
function pushEnabled(){
  return !!cfg.SUBSCRIBE_TEMPLATE_ID && hasCloud();
}

// 同步单个事件（无需手势，失败静默）
function ensureSync(e){
  if(!pushEnabled() || !e || !e.id) return;
  wx.cloud.callFunction({
    name: 'syncEvent',
    data: { action: 'upsert', event: {
      id: e.id, name: e.name, date: e.date, time: e.time,
      doneOn: e.doneOn, weekdays: e.weekdays, isBirthday: e.isBirthday
    } }
  }).catch(() => {});
}

// 事件删除后移除云端记录
function removeSync(eventId){
  if(!pushEnabled() || !eventId) return;
  wx.cloud.callFunction({ name: 'syncEvent', data: { action: 'delete', eventId: eventId } }).catch(() => {});
}

// 清空全部同步记录
function removeAllSync(){
  if(!pushEnabled()) return;
  wx.cloud.callFunction({ name: 'syncEvent', data: { action: 'deleteAll' } }).catch(() => {});
}

// 请求订阅授权并同步（必须在用户点击的同步调用链里，如"保存提醒"按钮）
// 用户拒绝也照常保存事件（同步会进行，但推送时因无额度自动跳过）
function askAndSync(e){
  if(!pushEnabled() || !e || !e.id) return;
  try{
    wx.requestSubscribeMessage({
      tmplIds: [cfg.SUBSCRIBE_TEMPLATE_ID],
      complete: () => { ensureSync(e); },   // 同意/拒绝都同步；额度问题由 pushDue 侧兜底
      fail: () => { ensureSync(e); }
    });
  }catch(err){ ensureSync(e); }
}

module.exports = { pushEnabled, ensureSync, removeSync, removeAllSync, askAndSync };
