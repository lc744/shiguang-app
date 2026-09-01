// 绸缪精灵 · 悬浮聊天面板组件 —— 移植自 Web 版 app/genie.js（toggleGenie/addGenieBubble/submitGenieText/toggleGenieVoice）
const store = require('../../utils/store');
const core = require('../../utils/core');
const genieCore = require('../../utils/genie-core');

// 微信同声传译插件（app.json 已声明；管理后台需添加该插件）
let plugin = null;
try{ plugin = require('WechatSI'); }catch(e){ plugin = null; }

let bubbleSeq = 0; // 气泡自增序号（滚动锚点 id 用）

Component({
  data: {
    open: false,        // 面板展开态
    bubbles: [],        // 消息列表 [{id, role:'user'|'assistant', text}]
    inputValue: '',
    lastId: '',         // scroll-into-view 锚点（最后一条消息）
    recording: false    // 语音识别进行中
  },

  lifetimes: {
    detached(){
      this.stopVoice();
      this._manager = null;
    }
  },

  methods: {
    /* ---------------- 开合 ---------------- */
    // 悬浮按钮：开/关切换（与 Web 版 toggleGenie 一致）
    onFabTap(){
      if(this.data.open) this.closePanel();
      else this.openPanel();
    },

    openPanel(){
      // 首次打开插入开场白
      if(!this.data.bubbles.length){
        this.pushBubble('assistant', '你好呀，我是绸缪精灵 🧚 可以陪你聊天，也能帮你添加提醒、换背景、查日程。试试对我说“明天上午9点开会”，或者随便跟我聊聊～');
      }
      this.setData({ open: true });
    },

    onCloseTap(){ this.closePanel(); },

    closePanel(){
      this.stopVoice();
      this.setData({ open: false });
    },

    noop(){},

    /* ---------------- 消息气泡 ---------------- */
    pushBubble(role, text){
      bubbleSeq += 1;
      const id = 'gb' + bubbleSeq;
      this.setData({
        bubbles: this.data.bubbles.concat([{ id: id, role: role, text: text }]),
        lastId: id
      });
    },

    /* ---------------- 文字输入（submitGenieText） ---------------- */
    onInput(e){ this.setData({ inputValue: e.detail.value }); },

    onSend(){
      const text = String(this.data.inputValue || '').trim();
      if(!text) return; // 空文本忽略
      this.setData({ inputValue: '' });
      this.handleSubmit(text);
    },

    // 用户输入统一入口（文字 / 语音识别结果）
    handleSubmit(text){
      this.pushBubble('user', text);
      let reply = '';
      try{
        reply = genieCore.processGenie(text, this.buildApi()) || '';
      }catch(e){
        reply = '哎呀，我这边出了点小差错……再试一次？';
      }
      if(reply) this.pushBubble('assistant', reply);
    },

    /* ---------------- api 回调（副作用由组件实现） ---------------- */
    buildApi(){
      return {
        // 添加事件并持久化，返回是否成功
        addEvent: (ev) => this.apiAddEvent(ev),
        // 事件数组
        getAllEvents: () => store.getEvents(),
        // 清空全部事件（同时清理自定义录音文件）
        clearAll: () => this.apiClearAll(),
        // 按名称删除事件
        deleteEvent: (name) => this.apiDeleteEvent(name),
        // 换背景色（存全局，页面在下次 onShow 时刷新）
        setBgColor: (color) => {
          const app = getApp();
          if(app && app.setBgColor) app.setBgColor(color);
        },
        // 切换主题（dark/light/system）
        setTheme: (theme) => {
          const app = getApp();
          if(app && app.setTheme) app.setTheme(theme);
        },
        // 今日日程文本
        getTodayEvents: () => this.apiTodayText(),
        // 轻提示
        toast: (msg) => { wx.showToast({ title: msg, icon: 'none' }); }
      };
    },

    apiAddEvent(ev){
      try{
        if(!ev || !ev.name) return false;
        if(!/^\d{4}-\d{2}-\d{2}$/.test(ev.date || '')) return false;
        if(!/^\d{2}:\d{2}$/.test(ev.time || '')) return false;
        const list = store.getEvents();
        list.push({
          id: ev.id || core.uid(),
          name: String(ev.name).slice(0, 30),
          note: ev.note || '',
          date: ev.date,
          time: ev.time,
          emoji: ev.emoji || core.EMOJIS[0],
          voice: ev.voice || core.VOICES[0],
          weekdays: ev.weekdays || [],
          doneOn: [],
          firedOn: []
        });
        store.setEvents(list);
        return true;
      }catch(e){ return false; }
    },

    apiClearAll(){
      const list = store.getEvents();
      list.forEach(e => store.deleteRecording(e.voiceData));
      store.setEvents([]);
    },

    apiDeleteEvent(name){
      const list = store.getEvents();
      const idx = list.findIndex(e => e.name === name);
      if(idx < 0) return false;
      store.deleteRecording(list[idx].voiceData);
      list.splice(idx, 1);
      store.setEvents(list);
      return true;
    },

    // 今日列表文本（与 Web 版 processGenie 查今日分支格式一致）
    apiTodayText(){
      const t = core.todayStr();
      const list = store.getEvents().filter(e => core.occursOn(e, t));
      const label = this.dateLabel(t);
      if(!list.length) return label + '暂无事件 ✨';
      const lines = list.map(e => {
        const done = core.isDoneOn(e, t) ? ' ✅' : '';
        return e.time + ' · ' + store.emojiIcon(e.emoji) + ' ' + e.name + done;
      });
      return label + '有 ' + list.length + ' 个事件：\n' + lines.join('\n');
    },

    // 对应 Web 版 ui.js dateLabel：今天 / 明天 / M月D日
    dateLabel(ds){
      const today = core.todayStr();
      if(ds === today) return '今天';
      if(ds === core.todayStr(new Date(Date.now() + 86400000))) return '明天';
      const d = new Date(ds + 'T00:00:00');
      return (d.getMonth() + 1) + '月' + d.getDate() + '日';
    },

    /* ---------------- 语音识别（微信同声传译插件） ---------------- */
    onVoiceTap(){
      if(this.data.recording){ this.stopVoice(); return; }
      if(!this._manager){
        if(!plugin || !plugin.getRecordRecognitionManager){
          wx.showToast({ title: '语音识别插件不可用，请用文字输入', icon: 'none' });
          return;
        }
        this.initManager();
      }
      this.setData({ recording: true });
      try{
        this._manager.start({ lang: 'zh_CN', duration: 30000 });
      }catch(e){
        this.setData({ recording: false });
        this.pushBubble('assistant', '语音识别启动失败，请用文字输入');
      }
    },

    initManager(){
      const manager = plugin.getRecordRecognitionManager();
      // 中间识别结果：不展示，等最终结果
      manager.onRecognize(res => {});
      // 识别结束（手动 stop 或达到时长上限）：结果当作用户输入处理
      manager.onStop(res => {
        this.setData({ recording: false });
        const text = String((res && res.result) || '').trim();
        if(text) this.handleSubmit(text);
      });
      manager.onError(res => {
        this.setData({ recording: false });
        const msg = String((res && (res.msg || res.errMsg || res.message)) || '');
        if(/deny|denied|auth|权限/i.test(msg)){
          this.pushBubble('assistant', '麦克风权限未开启，请在设置中允许绸缪使用麦克风');
        } else if(/no\s*speech|没听到|无声/i.test(msg)){
          this.pushBubble('assistant', '没有听到声音，请再试一次');
        } else {
          this.pushBubble('assistant', '语音识别失败，试试文字输入吧');
        }
      });
      this._manager = manager;
    },

    stopVoice(){
      if(this.data.recording) this.setData({ recording: false });
      if(this._manager){
        try{ this._manager.stop(); }catch(e){}
      }
    }
  }
});
