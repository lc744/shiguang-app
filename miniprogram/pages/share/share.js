// 绸缪 v2 · 分享页：信息流 / 我的发布 双 tab，点赞、举报、下拉刷新、触底加载
const callPost = (data) => new Promise((resolve, reject) => {
  if(!wx.cloud || !wx.cloud.callFunction){ reject(new Error('云开发未开通')); return; }
  wx.cloud.callFunction({ name: 'postApi', data })
    .then(r => resolve(r.result))
    .catch(e => reject(new Error(e.errMsg || e.message || '网络异常')));
});

Page({
  data: {
    tab: 'feed',            // feed | mine
    list: [],
    page: 0,
    hasMore: true,
    loading: false,
    empty: false
  },

  onShow(){ this.refresh(); },

  switchTab(e){
    const tab = e.currentTarget.dataset.tab;
    if(tab === this.data.tab) return;
    this.setData({ tab, list: [], page: 0, hasMore: true, empty: false });
    this.refresh();
  },

  refresh(){
    this.setData({ page: 0, hasMore: true });
    return this.load(true);
  },

  onPullDownRefresh(){
    this.refresh().then(() => wx.stopPullDownRefresh()).catch(() => wx.stopPullDownRefresh());
  },

  onReachBottom(){
    if(this.data.hasMore && !this.data.loading) this.load(false);
  },

  load(reset){
    if(this.data.loading) return Promise.resolve();
    const page = reset ? 0 : this.data.page;
    this.setData({ loading: true });
    const action = this.data.tab === 'feed' ? 'feed' : 'mine';
    return callPost({ action, page })
      .then(r => {
        if(!r || !r.ok) throw new Error(r && r.error || '加载失败');
        const list = reset ? r.list : this.data.list.concat(r.list);
        this.setData({
          list,
          page: page + 1,
          hasMore: r.hasMore !== false && action === 'feed',
          empty: list.length === 0
        });
      })
      .catch(e => { wx.showToast({ title: e.message || '加载失败', icon: 'none' }); })
      .then(() => this.setData({ loading: false }));
  },

  onLike(e){
    const id = e.currentTarget.dataset.id;
    const idx = this.data.list.findIndex(x => x._id === id);
    if(idx < 0) return;
    callPost({ action: 'like', id })
      .then(r => {
        if(!r || !r.ok) return;
        const item = this.data.list[idx];
        this.setData({
          ['list[' + idx + '].likes']: item.likes + (r.liked ? 1 : -1),
          ['list[' + idx + '].selfLiked']: r.liked
        });
      })
      .catch(e => wx.showToast({ title: e.message || '操作失败', icon: 'none' }));
  },

  onReport(e){
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '举报该内容',
      editable: true,
      placeholderText: '简述举报理由（选填）',
      success: res => {
        if(!res.confirm) return;
        callPost({ action: 'report', id, reason: res.content || '' })
          .then(r => {
            if(!r || !r.ok) throw new Error(r && r.error || '举报失败');
            if(r.hiddenNow){ wx.showToast({ title: '内容已隐藏', icon: 'none' }); this.refresh(); }
            else if(r.already) wx.showToast({ title: '你已举报过该内容', icon: 'none' });
            else wx.showToast({ title: '举报已收到', icon: 'none' });
          })
          .catch(e => wx.showToast({ title: e.message || '举报失败', icon: 'none' }));
      }
    });
  },

  onDel(e){
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除这条发布？',
      content: '照片与内容将一并删除，不可恢复',
      confirmText: '删除',
      confirmColor: '#c65c52',
      success: res => {
        if(!res.confirm) return;
        callPost({ action: 'del', id })
          .then(r => {
            if(!r || !r.ok) throw new Error(r && r.error || '删除失败');
            wx.showToast({ title: '已删除', icon: 'none' });
            const list = this.data.list.filter(x => x._id !== id);
            this.setData({ list, empty: list.length === 0 });
          })
          .catch(e => wx.showToast({ title: e.message || '删除失败', icon: 'none' }));
      }
    });
  },

  goPublish(){ wx.navigateTo({ url: '/pages/share/publish' }); },

  onImageTap(e){
    const { urls, current } = e.currentTarget.dataset;
    wx.previewImage({ urls, current });
  }
});
