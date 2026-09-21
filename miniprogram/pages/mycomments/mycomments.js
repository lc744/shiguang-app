// 绸缪小程序 · 我的评论（列表 + 跳转原帖 + 删除）
const callPost = (data) => new Promise((resolve, reject) => {
  if(!wx.cloud || !wx.cloud.callFunction){ reject(new Error('云开发未开通')); return; }
  wx.cloud.callFunction({ name: 'postApi', data })
    .then(r => resolve(r.result))
    .catch(e => reject(new Error(e.errMsg || e.message || '网络异常')));
});

function fmtTime(ms){
  const diff = Date.now() - ms;
  if(diff < 60000) return '刚刚';
  if(diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
  if(diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前';
  if(diff < 604800000) return Math.floor(diff / 86400000) + ' 天前';
  const d = new Date(ms);
  return (d.getMonth() + 1) + '月' + d.getDate() + '日';
}

// 帖子类型 emoji（对齐安卓 CMT_TYPE_EMOJI）
const CMT_TYPE_EMOJI = { '美食': '🍜', '景点': '🏞', '娱乐': '🎡', '餐厅': '🍜' };
const trunc = (s, n) => (String(s || '').length > n ? String(s).slice(0, n) + '…' : String(s || ''));

Page({
  data: { list: [], loading: true },

  onShow(){ this.refresh(); },

  refresh(){
    callPost({ action: 'myComments' })
      .then(r => {
        if(!r || !r.ok) throw new Error(r && r.error || '加载失败');
        const list = (r.list || []).map(x => {
          const gone = !!x.hidden || (!x.postId && !x.pname);
          return {
            ...x,
            timeText: fmtTime(x.createdAt),
            emoji: CMT_TYPE_EMOJI[x.ptype] || '📌',
            postName: trunc(x.pname || x.paddr || '帖子', 16),
            gone: gone
          };
        });
        this.setData({ list, loading: false });
      })
      .catch(e => { this.setData({ loading: false }); wx.showToast({ title: e.message || '加载失败', icon: 'none' }); });
  },

  goPost(e){
    if(e.currentTarget.dataset.gone){ wx.showToast({ title: '原帖已删除或已下架', icon: 'none' }); return; }
    wx.navigateTo({ url: '/pages/share/post?id=' + e.currentTarget.dataset.pid });
  },

  onDel(e){
    const cid = e.currentTarget.dataset.cid;
    wx.showModal({
      title: '删除这条评论？',
      confirmText: '删除',
      confirmColor: '#c65c52',
      success: res => {
        if(!res.confirm) return;
        callPost({ action: 'commentDel', cid })
          .then(r => {
            if(!r || !r.ok) throw new Error(r && r.error || '删除失败');
            this.setData({ list: this.data.list.filter(x => x.cid !== cid) });
            wx.showToast({ title: '已删除', icon: 'none' });
          })
          .catch(e => wx.showToast({ title: e.message || '删除失败', icon: 'none' }));
      }
    });
  }
});
