// 绸缪小程序 · 内容管理（对齐 App 管理面板：待审帖子/评论 → 恢复或删除）
const callPost = (data) => new Promise((resolve, reject) => {
  if(!wx.cloud || !wx.cloud.callFunction){ reject(new Error('云开发未开通')); return; }
  wx.cloud.callFunction({ name: 'postApi', data })
    .then(r => resolve(r.result))
    .catch(e => reject(new Error(e.errMsg || e.message || '网络异常')));
});

const _fileMap = {};
function fileUrls(photos){
  const arr = (photos || []).map(String);
  const ids = arr.filter(s => s.indexOf('cloud://') === 0);
  if(!ids.length) return Promise.resolve(arr);
  return wx.cloud.getTempFileURL({ fileList: ids }).then(res => {
    const map = {};
    (res.fileList || []).forEach(f => { if(f.tempFileURL) map[f.fileID] = f.tempFileURL; });
    return arr.map(s => map[s] || s);
  }).catch(() => arr);
}

Page({
  data: {
    tab: 'posts',       // posts | comments
    posts: [],
    comments: [],
    loading: true
  },

  onShow(){ this.refresh(); },

  refresh(){
    callPost({ action: 'adminList' })
      .then(r => {
        if(!r || !r.ok) throw new Error(r && r.error || '加载失败');
        const posts = r.posts || [];
        // 待审帖子首图 → 临时链接
        Promise.all(posts.map(p => p.photos.length ? fileUrls([p.photos[0]]) : Promise.resolve([])))
          .then(urlLists => {
            this.setData({
              posts: posts.map((p, i) => ({ ...p, thumb: (urlLists[i] && urlLists[i][0]) || '' })),
              comments: r.comments || [],
              loading: false
            });
          }).catch(() => this.setData({ posts, comments: r.comments || [], loading: false }));
      })
      .catch(e => {
        this.setData({ loading: false });
        wx.showToast({ title: e.message || '无管理权限或加载失败', icon: 'none' });
        setTimeout(() => wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/me/me' }) }), 900);
      });
  },

  switchTab(e){
    this.setData({ tab: e.currentTarget.dataset.tab });
  },

  _act(kind, id, act){
    const action = kind === 'post' ? 'adminPostAction' : 'adminCommentAction';
    const key = kind === 'post' ? 'id' : 'cid';
    callPost({ action, [key]: id, act })
      .then(r => {
        if(!r || !r.ok) throw new Error(r && r.error || '操作失败');
        wx.showToast({ title: act === 'restore' ? '已恢复显示' : '已删除', icon: 'none' });
        this.refresh();
      })
      .catch(e => wx.showToast({ title: e.message || '操作失败', icon: 'none' }));
  },

  onRestore(e){ this._act(e.currentTarget.dataset.kind, e.currentTarget.dataset.id, 'restore'); },
  onDelete(e){
    const { kind, id } = e.currentTarget.dataset;
    wx.showModal({
      title: '彻底删除该内容？',
      content: '删除后不可恢复（含照片文件）',
      confirmText: '删除',
      confirmColor: '#c65c52',
      success: res => { if(res.confirm) this._act(kind, id, 'delete'); }
    });
  }
});
