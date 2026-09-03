// 绸缪小程序 · 轻量全局配置
module.exports = {
  // 订阅消息模板 ID：在 mp.weixin.qq.com「功能 →订阅消息 →公共模板库」选一个日程/提醒类模板，
  // 把「我的模板」里的 ID 填到这里。留空 = 推送功能整体关闭（本地到点弹窗不受影响）。
  // 注意：云函数 pushDue 的 secret.json 里也要填同一个 ID（它负责发送）。
  SUBSCRIBE_TEMPLATE_ID: ''
};
