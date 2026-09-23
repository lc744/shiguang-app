// 绸缪小程序 · 推荐详情页（帖子大图 + 点赞/举报 + 评论区：发表/删除/举报）——微信云开发
const callPost = (data) => new Promise((resolve, reject) => {
  if(!wx.cloud || !wx.cloud.callFunction){ reject(new Error('云开发未开通')); return; }
  wx.cloud.callFunction({ name: 'postApi', data })
    .then(r => resolve(r.result))
    .catch(e => reject(new Error(e.errMsg || e.message || '网络异常')));
});

// cloud:// fileID → 临时展示链接（带缓存）
const _fileMap = {};
function resolvePhotoUrls(post, cb){
  const arr = (post.photos || []).map(String);
  const ids = arr.filter(s => s.indexOf('cloud://') === 0 && !(_fileMap[s]));
  const done = () => cb(arr.map(s => (_fileMap[s]) || s));
  if(!ids.length || !wx.cloud || !wx.cloud.getTempFileURL){ done(); return; }
  wx.cloud.getTempFileURL({ fileList: ids })
    .then(res => { (res.fileList || []).forEach(f => { if(f.tempFileURL) _fileMap[f.fileID] = f.tempFileURL; }); done(); })
    .catch(done);
}

function fmtTime(ms){
  const diff = Date.now() - ms;
  if(diff < 60000) return '刚刚';
  if(diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
  if(diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前';
  if(diff < 604800000) return Math.floor(diff / 86400000) + ' 天前';
  const d = new Date(ms);
  return (d.getMonth() + 1) + '月' + d.getDate() + '日';
}

Page({
  data: {
    post: null,
    comments: [],
    commentCount: 0,
    draft: '',
    sending: false,
    loading: true
  },

  onLoad(options){ this._id = (options && options.id) || ''; this.refresh(); },

  refresh(){
    return Promise.all([
      callPost({ action: 'get', id: this._id }),
      callPost({ action: 'commentList', id: this._id })
    ]).then(([p, c]) => {
      if(!p || !p.ok){ wx.showToast({ title: (p && p.error) || '内容不存在', icon: 'none' }); setTimeout(() => this.goBack(), 900); return; }
      const post = p.post;
      post.liked = !!post.selfLiked;
      this.setData({
        post,
        comments: (c && c.list || []).map(x => ({ ...x, timeText: fmtTime(x.createdAt) })),
        commentCount: post.commentCount || (c && c.list || []).length,
        loading: false
      });
      // cloud:// → 临时链接后刷新展示
      resolvePhotoUrls(post, urls => {
        if(this.data.post && this.data.post._id === post._id) this.setData({ 'post.photoUrls': urls });
      });
    }).catch(e => {
      this.setData({ loading: false });
      wx.showToast({ title: e.message || '加载失败', icon: 'none' });
    });
  },

  goBack(){ wx.navigateBack({ fail: () => wx.navigateTo({ url: '/pages/share/share' }) }); },

  onImageTap(e){
    const { urls, current } = e.currentTarget.dataset;
    wx.previewImage({ urls, current });
  },

  onLike(){
    callPost({ action: 'like', id: this._id }).then(r => {
      if(!r || !r.ok) return;
      this.setData({
        'post.likes': this.data.post.likes + (r.liked ? 1 : -1),
        'post.liked': r.liked
      });
    }).catch(e => wx.showToast({ title: e.message || '操作失败', icon: 'none' }));
  },

  onReport(){
    wx.showModal({
      title: '举报该内容',
      editable: true,
      placeholderText: '简述举报理由（选填）',
      success: res => {
        if(!res.confirm) return;
        callPost({ action: 'report', id: this._id, reason: res.content || '' })
          .then(r => {
            if(r && r.hiddenNow){ wx.showToast({ title: '内容已隐藏', icon: 'none' }); this.goBack(); }
            else wx.showToast({ title: r && r.already ? '你已举报过' : '举报已收到', icon: 'none' });
          })
          .catch(e => wx.showToast({ title: e.message || '举报失败', icon: 'none' }));
      }
    });
  },

  onDel(){
    wx.showModal({
      title: '删除这条发布？',
      content: '照片与内容将一并删除，不可恢复',
      confirmText: '删除',
      confirmColor: '#c65c52',
      success: res => {
        if(!res.confirm) return;
        callPost({ action: 'del', id: this._id })
          .then(r => { if(r && r.ok){ wx.showToast({ title: '已删除', icon: 'none' }); setTimeout(() => this.goBack(), 500); } })
          .catch(e => wx.showToast({ title: e.message || '删除失败', icon: 'none' }));
      }
    });
  },

  onDraftInput(e){ this.setData({ draft: e.detail.value }); },

  onSend(){
    const content = (this.data.draft || '').trim();
    if(!content){ wx.showToast({ title: '说点什么再发吧', icon: 'none' }); return; }
    if(this.data.sending) return;
    this.setData({ sending: true });
    // 评论带上用户昵称（与发布页同一身份来源）
    let nickname = '路过的朋友';
    try{ const id = wx.getStorageSync('shiguang_share_identity') || {}; if(id && id.nickname) nickname = String(id.nickname).slice(0, 20); }catch(e){}
    callPost({ action: 'commentAdd', id: this._id, content, nickname })
      .then(r => {
        if(!r || !r.ok) throw new Error(r && r.error || '发送失败');
        this.setData({ draft: '', sending: false });
        wx.showToast({ title: '已发送', icon: 'none' });
        // 只刷新评论列表，不动帖子正文
        callPost({ action: 'commentList', id: this._id }).then(c => {
          if(c && c.ok) this.setData({ comments: c.list.map(x => ({ ...x, timeText: fmtTime(x.createdAt) })), commentCount: c.list.length });
        }).catch(() => {});
      })
      .catch(e => { this.setData({ sending: false }); wx.showToast({ title: e.message || '发送失败', icon: 'none' }); });
  },

  onCommentDel(e){
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
            this.setData({
              comments: this.data.comments.filter(x => x._id !== cid),
              commentCount: Math.max(0, this.data.commentCount - 1)
            });
            wx.showToast({ title: '已删除', icon: 'none' });
          })
          .catch(e => wx.showToast({ title: e.message || '删除失败', icon: 'none' }));
      }
    });
  },

  onCommentReport(e){
    const cid = e.currentTarget.dataset.cid;
    wx.showModal({
      title: '举报该评论',
      editable: true,
      placeholderText: '简述举报理由（选填）',
      success: res => {
        if(!res.confirm) return;
        callPost({ action: 'commentReport', cid })
          .then(r => {
            if(r && r.hiddenNow){
              wx.showToast({ title: '评论已隐藏', icon: 'none' });
              this.setData({ comments: this.data.comments.filter(x => x._id !== cid) });
            }
            else wx.showToast({ title: r && r.already ? '你已举报过' : '举报已收到', icon: 'none' });
          })
          .catch(e => wx.showToast({ title: e.message || '举报失败', icon: 'none' }));
      }
    });
  }
});
