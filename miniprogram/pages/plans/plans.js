// 绸缪小程序 · 旅游攻略存档（对齐 App plansOverlay：列表/恢复到分享页/删除）
const callPost = (data) => new Promise((resolve, reject) => {
  if(!wx.cloud || !wx.cloud.callFunction){ reject(new Error('云开发未开通')); return; }
  wx.cloud.callFunction({ name: 'postApi', data })
    .then(r => resolve(r.result))
    .catch(e => reject(new Error(e.errMsg || e.message || '网络异常')));
});

function fmtDate(iso){
  if(!iso || iso.length < 10) return '';
  return iso.slice(5).replace('-', '月') + '日';
}

Page({
  data: { list: [], loading: true },

  onShow(){ this.refresh(); },

  refresh(){
    callPost({ action: 'planList' })
      .then(r => {
        if(!r || !r.ok) throw new Error(r && r.error || '加载失败');
        const list = (r.list || []).map(p => ({
          ...p,
          dateLabel: fmtDate(p.dateIso),
          count: (p.items || []).length,
          stops: (p.items || []).map(x => x.name).filter(Boolean).slice(0, 3).join(' · ')
        }));
        this.setData({ list, loading: false });
      })
      .catch(e => { this.setData({ loading: false }); wx.showToast({ title: e.message || '加载失败', icon: 'none' }); });
  },

  // 点击 → 恢复到分享页攻略弹层（globalData 交接）
  onOpen(e){
    const id = e.currentTarget.dataset.id;
    const p = this.data.list.find(x => x.id === id);
    if(!p) return;
    const app = getApp();
    if(app){ app.globalData = app.globalData || {}; app.globalData.planRestore = { city: p.city, dateIso: p.dateIso, items: p.items }; }
    wx.switchTab({ url: '/pages/share/share' });
  },

  onDel(e){
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除这份攻略？',
      confirmText: '删除',
      confirmColor: '#c65c52',
      success: res => {
        if(!res.confirm) return;
        callPost({ action: 'planDel', id })
          .then(r => {
            if(!r || !r.ok) throw new Error(r && r.error || '删除失败');
            this.setData({ list: this.data.list.filter(x => x.id !== id) });
            wx.showToast({ title: '已删除', icon: 'none' });
          })
          .catch(e => wx.showToast({ title: e.message || '删除失败', icon: 'none' }));
      }
    });
  }
});
