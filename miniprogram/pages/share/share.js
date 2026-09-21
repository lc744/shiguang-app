// 绸缪 v2 · 分享页：信息流 / 我的发布 双 tab，点赞、举报、下拉刷新、触底加载（微信云开发）
const callPost = (data) => new Promise((resolve, reject) => {
  if(!wx.cloud || !wx.cloud.callFunction){ reject(new Error('云开发未开通')); return; }
  wx.cloud.callFunction({ name: 'postApi', data })
    .then(r => resolve(r.result))
    .catch(e => reject(new Error(e.errMsg || e.message || '网络异常')));
});

// cloud:// fileID → 临时展示链接（带缓存；回调里做 setData 更新）
function resolvePhotoUrls(photos, cb){
  const arr = (photos || []).map(String);
  const ids = arr.filter(s => s.indexOf('cloud://') === 0 && !(_fileMap[s]));
  const done = () => cb(arr.map(s => (_fileMap[s]) || s));
  if(!ids.length || !wx.cloud || !wx.cloud.getTempFileURL){ done(); return; }
  wx.cloud.getTempFileURL({ fileList: ids })
    .then(res => { (res.fileList || []).forEach(f => { if(f.tempFileURL) _fileMap[f.fileID] = f.tempFileURL; }); done(); })
    .catch(done);
}
const _fileMap = {};

Page({
  data: {
    tab: 'feed',            // feed | mine
    list: [],
    page: 0,
    hasMore: true,
    loading: false,
    empty: false,
    feedType: '',           // 筛选：'' 全部 | 美食 | 景点 | 娱乐
    feedTypes: ['美食', '景点', '娱乐'],
    feedCity: '',           // 筛选城市（空=不限）
    planForm: false,        // 攻略：选城市/日期弹层
    plan: null,             // 攻略结果 {city, dateIso, dateLabel, count, items}
    planCity: '',
    planRegion: [],
    planDate: '',
    today: ''
  },

  onShow(){
    if(typeof this.getTabBar === 'function' && this.getTabBar()){
      this.getTabBar().setData({ selected: 3 });
    }
    // 「我的」页跳转：指定打开哪个分段
    const app = getApp();
    let tab = this.data.tab;
    if(app && app.globalData && app.globalData.shareTab){
      tab = app.globalData.shareTab;
      app.globalData.shareTab = null;
    }
    if(tab !== this.data.tab){ this.setData({ tab, list: [], page: 0, hasMore: true, empty: false }); }
    this.refresh();
  },

  switchTab(e){
    const tab = e.currentTarget.dataset.tab;
    if(tab === this.data.tab) return;
    this.setData({ tab, list: [], page: 0, hasMore: true, empty: false });
    this.refresh();
  },

  /* 筛选（对齐 App：类型 × 城市） */
  pickFeedType(e){
    const t = e.currentTarget.dataset.t || '';
    if(t === this.data.feedType) return;
    this.setData({ feedType: t, list: [], page: 0, hasMore: true, empty: false });
    this.refresh();
  },
  onFeedRegion(e){
    const v = (e.detail && e.detail.value) || [];
    const city = (v[1] || '').replace(/市辖区|县/g, '') || (v[0] || '');
    this.setData({ feedCity: city, list: [], page: 0, hasMore: true, empty: false });
    this.refresh();
  },
  clearFeedCity(){
    if(!this.data.feedCity) return;
    this.setData({ feedCity: '', list: [], page: 0, hasMore: true, empty: false });
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
    const payload = { action, page };
    if(action === 'feed'){
      if(this.data.feedType) payload.type = this.data.feedType;
      if(this.data.feedCity) payload.city = this.data.feedCity;
    }
    return callPost(payload)
      .then(r => {
        if(!r || !r.ok) throw new Error(r && r.error || '加载失败');
        const raw = reset ? r.list : this.data.list.concat(r.list);
        const apply = (list) => {
          this.setData({
            list,
            page: page + 1,
            hasMore: r.hasMore !== false && action === 'feed',
            empty: list.length === 0
          });
        };
        // 先按现有缓存/直链立即渲染，cloud:// 引用异步换链接后刷新
        const list0 = raw.map(p => ({ ...p, photoUrls: (p.photos || []).map(String) }));
        apply(list0);
        raw.forEach(p => resolvePhotoUrls(p.photos, urls => {
          const idx = this.data.list.findIndex(x => x._id === p._id);
          if(idx >= 0) this.setData({ ['list[' + idx + '].photoUrls']: urls });
        }));
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

  goPost(e){ wx.navigateTo({ url: '/pages/share/post?id=' + e.currentTarget.dataset.id }); },

  /* ---------------- 行程攻略（对齐 App：按城市拉三类推荐 → 随机编排 5 时段 → 一键加入提醒） ---------------- */
  openPlanMaker(){
    const d = new Date(); d.setDate(d.getDate() + 1);
    const p = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    const t = new Date();
    this.setData({ planForm: true, plan: null, planCity: '', planRegion: [], planDate: p, today: t.getFullYear() + '-' + String(t.getMonth()+1).padStart(2,'0') + '-' + String(t.getDate()).padStart(2,'0') });
  },
  noop(){},
  closePlanForm(){ this.setData({ planForm: false }); },
  closePlan(){ this.setData({ plan: null }); },
  onPlanRegion(e){
    const v = (e.detail && e.detail.value) || [];
    this.setData({ planRegion: v, planCity: (v[1] || '').replace(/市辖区|县/g, '') || (v[0] || '') });
  },
  onPlanDate(e){ this.setData({ planDate: e.detail.value }); },

  _fetchFeed(type, city){
    return callPost({ action: 'feed', page: 0, city, type }).then(r => {
      if(!r || !r.ok) return [];
      return r.list || [];
    });
  },

  makePlan(){
    const city = this.data.planCity;
    if(!city){ wx.showToast({ title: '先选个城市', icon: 'none' }); return; }
    const dateIso = this.data.planDate;
    wx.showLoading({ title: '正在编排 ' + city + ' 行程…', mask: true });
    // 五类串行拉取（间隔 400ms 避让频控）：美食+餐厅=吃，景点+娱乐+其他=玩（兼容存量分类）
    const grab = (t) => this._fetchFeed(t, city).then(list => new Promise(res => setTimeout(() => res(list), 400)));
    Promise.all([grab('美食'), grab('餐厅'), grab('景点'), grab('娱乐'), grab('其他')])
      .then(([foods, rests, spots, funs, others]) => {
        this._buildPlan(city, dateIso, foods.concat(rests), spots.concat(funs, others));
      })
      .catch(() => { wx.hideLoading(); wx.showToast({ title: '攻略生成失败，稍后再试', icon: 'none' }); });
  },

  _buildPlan(city, dateIso, foods, plays){
    wx.hideLoading();
    const mk = (slot, time, emoji, p, fbName) => ({
      slot, time, emoji,
      name: p ? (p.name || p.addr || fbName) : fbName,
      addr: p ? (p.addr || '') : ''
    });
    const picks = (arr, n) => {
      const a = (arr || []).filter(x => x).slice();
      const out = [];
      while(out.length < n && a.length){ out.push(a.splice(Math.floor(Math.random() * a.length), 1)[0]); }
      while(out.length < n) out.push(null);
      return out;
    };
    const [f1, f2, f3] = picks(foods, 3);
    const [p1, p2] = picks(plays, 2);
    const items = [
      mk('早餐', '08:00', '🥟', f1, '来一碗热乎的当地早餐'),
      mk('上午游玩', '10:00', '🏞', p1, '逛逛本地的经典去处'),
      mk('午餐', '12:00', '🍜', f2, '尝尝本地人气美味'),
      mk('下午游玩', '14:30', '🎡', p2, '继续探索这座城市'),
      mk('晚餐', '18:00', '🍲', f3, '用一顿好饭收尾')
    ];
    const used = (f1?1:0)+(p1?1:0)+(f2?1:0)+(p2?1:0)+(f3?1:0);
    if(!used){ wx.showToast({ title: city + ' 还没有推荐内容，发布几条就有了', icon: 'none', duration: 2500 }); return; }
    this.setData({
      planForm: false,
      plan: {
        city, dateIso,
        dateLabel: dateIso.slice(5).replace('-', '月') + '日',
        count: used,
        items: items.map(it => ({ ...it, added: false }))
      }
    });
  },

  regenPlan(){
    const { planCity, planDate } = this.data;
    if(!planCity){ this.setData({ plan: null }); return; }
    wx.showLoading({ title: '重新编排…', mask: true });
    const grab = (t) => this._fetchFeed(t, planCity).then(list => new Promise(res => setTimeout(() => res(list), 400)));
    Promise.all([grab('美食'), grab('餐厅'), grab('景点'), grab('娱乐'), grab('其他')])
      .then(([foods, rests, spots, funs, others]) => {
        this._buildPlan(planCity, planDate, foods.concat(rests), spots.concat(funs, others));
      })
      .catch(() => { wx.hideLoading(); wx.showToast({ title: '生成失败，稍后再试', icon: 'none' }); });
  },

  // 生成攻略海报（canvas 600x860：城市/日期/五时段 + 品牌脚注），保存到相册
  makePlanPoster(){
    const plan = this.data.plan;
    if(!plan || !(plan.items || []).length) return;
    const q = wx.createSelectorQuery();
    q.select('#plancanvas').fields({ node: true }).exec(res => {
      if(!res || !res[0] || !res[0].node){ wx.showToast({ title: '画布未就绪', icon: 'none' }); return; }
      const canvas = res[0].node;
      const W = 600, H = 860;
      canvas.width = W; canvas.height = H;
      const x = canvas.getContext('2d');
      // 背景
      let g = x.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#246353'); g.addColorStop(.55, '#3c8a70'); g.addColorStop(1, '#eaf6f0');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      // 标题
      x.fillStyle = '#fff';
      x.font = 'bold 40px sans-serif';
      x.textAlign = 'center';
      x.fillText(plan.city + ' · 出行攻略', W / 2, 96);
      x.font = '24px sans-serif';
      x.fillStyle = 'rgba(255,255,255,.85)';
      x.fillText(plan.dateLabel + ' 由绸缪为你编排', W / 2, 138);
      // 行程卡片
      const rows = plan.items || [];
      const top = 180, rh = 116, cw = 524, cx = (W - cw) / 2;
      x.textAlign = 'left';
      rows.forEach((it, i) => {
        const y = top + i * rh;
        x.fillStyle = 'rgba(255,255,255,.94)';
        x.fillRect(cx, y, cw, rh - 18);
        x.font = 'bold 30px sans-serif';
        x.fillStyle = '#246353';
        x.fillText((it.emoji || '📍') + ' ' + it.slot + ' ' + it.time, cx + 26, y + 44);
        x.font = '26px sans-serif';
        x.fillStyle = '#333';
        const name = String(it.name || '').slice(0, 15);
        x.fillText(name, cx + 26, y + 82);
      });
      // 脚注
      x.textAlign = 'center';
      x.fillStyle = 'rgba(36,99,83,.85)';
      x.font = 'bold 26px sans-serif';
      x.fillText('绸缪 · 未雨绸缪', W / 2, H - 28);
      // 导出保存
      wx.canvasToTempFilePath({
        canvas,
        success: r => {
          wx.saveImageToPhotosAlbum({
            filePath: r.tempFilePath,
            success: () => wx.showToast({ title: '海报已保存到相册', icon: 'none' }),
            fail: err => {
              if(err.errMsg && err.errMsg.indexOf('auth') >= 0){
                wx.showModal({ title: '需要相册权限', content: '请在设置中允许保存到相册', confirmText: '去设置', success: s => { if(s.confirm) wx.openSetting(); } });
              } else {
                wx.showToast({ title: '保存失败', icon: 'none' });
              }
            }
          });
        },
        fail: () => wx.showToast({ title: '海报生成失败', icon: 'none' })
      });
    });
  },

  addPlanToEvents(){
    const plan = this.data.plan;
    if(!plan || !(plan.items || []).length) return;
    const store = require('../../utils/store');
    const core = require('../../utils/core');
    const events = store.getEvents();
    let n = 0;
    plan.items.forEach(it => {
      if(!it || it.added) return;
      // 防重复：同日期同时段同名已存在则跳过
      const dup = events.some(x => x.date === plan.dateIso && x.time === it.time && x.name === ('行程·' + it.slot));
      if(dup) return;
      const ev = {
        id: core.uid(), name: '行程·' + it.slot, note: it.addr || ('来自' + plan.city + '行程攻略'),
        date: plan.dateIso, time: it.time, emoji: it.emoji, voice: '默认',
        weekdays: [], isBirthday: false, lunarBirthday: false, doneOn: [], firedOn: []
      };
      events.push(ev);
      n++;
    });
    if(!n){ wx.showToast({ title: '行程已加入过提醒啦', icon: 'none' }); return; }
    store.setEvents(events);
    this.setData({ 'plan.items': this.data.plan.items.map(it => ({ ...it, added: true })) });
    wx.showToast({ title: '已加入 ' + n + ' 条提醒', icon: 'success' });
  },

  onImageTap(e){
    const { urls, current } = e.currentTarget.dataset;
    wx.previewImage({ urls, current });
  }
});
