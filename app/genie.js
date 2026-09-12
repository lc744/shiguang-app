// 绸缪精灵 · 智能语音/文字助手
/* ---------------- 对话 UI ---------------- */
let genieMessages = [];
let genieRecognition = null;
let genieRecording = false;

function toggleGenie(){
  const panel = document.getElementById('geniePanel');
  const isOpen = panel.classList.contains('show');
  if(isOpen) closeGenie(); else openGenie();
}

function openGenie(){
  const panel = document.getElementById('geniePanel');
  panel.classList.add('show');
  if(!genieMessages.length){
    addGenieBubble('assistant', '你好呀，我是绸缪精灵 🧚 现在能干的活更多啦：添加提醒、查日程、逛社区、筛选帖子、看我的评论、还能一键生成城市旅游攻略图！点下方快捷指令或直接对我说～');
  }
  document.getElementById('genieInput').focus();
}

function closeGenie(){
  stopGenieListening();
  document.getElementById('geniePanel').classList.remove('show');
}

function addGenieBubble(role, text){
  const el = document.getElementById('genieBubbles');
  const bubble = document.createElement('div');
  bubble.className = 'genie-bubble genie-' + role;
  bubble.textContent = text;
  el.appendChild(bubble);
  el.scrollTop = el.scrollHeight;
  genieMessages.push({role, text});
}

/* ---------------- 语音识别 ---------------- */
async function toggleGenieVoice(){
  if(genieRecording){ stopGenieListening(); return; }

  // 优先使用原生语音识别（Android SpeechRecognizer，国产 ROM 可用）
  if(window.__NATIVE__ && window.__startSpeechRecognition){
    genieRecording = true;
    const btn = document.getElementById('genieVoiceBtn');
    btn.textContent = '⏹';
    btn.classList.add('recording');
    try{
      // 15 秒超时保护：真机语音识别通常在 5-8 秒内返回
      const result = await Promise.race([
        window.__startSpeechRecognition(),
        new Promise(r => setTimeout(() => r({errorCode: -99, message: '语音识别超时，请用文字输入，或检查网络后再试'}), 15000))
      ]);
      genieRecording = false;
      btn.textContent = '🎤';
      btn.classList.remove('recording');
      if(result && result.text){
        addGenieBubble('user', result.text);
        processGenie(result.text);
      } else if(result && result.message){
        addGenieBubble('assistant', result.message);
      } else {
        addGenieBubble('assistant', '语音识别失败，请用文字输入');
      }
      return;
    }catch(e){
      genieRecording = false;
      btn.textContent = '🎤';
      btn.classList.remove('recording');
      addGenieBubble('assistant', '语音识别出错……改用文字输入吧');
      return;
    }
  }

  // 回退：WebView 的 webkitSpeechRecognition（依赖 Google 服务，国产 ROM 可能不可用）
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SR){ addGenieBubble('assistant', '抱歉，当前环境不支持语音识别。请用文字输入吧～'); return; }
  try{
    genieRecognition = new SR();
    genieRecognition.lang = 'zh-CN';
    genieRecognition.interimResults = false;
    genieRecognition.maxAlternatives = 1;
    genieRecognition.onresult = (ev) => {
      const text = ev.results[0][0].transcript.trim();
      if(text) addGenieBubble('user', text);
      processGenie(text);
      stopGenieListening();
    };
    genieRecognition.onerror = (ev) => {
      stopGenieListening();
      if(ev.error === 'not-allowed') addGenieBubble('assistant', '麦克风权限未开启，请在系统设置中允许绸缪使用麦克风');
      else if(ev.error === 'no-speech') addGenieBubble('assistant', '没有听到声音，请再试一次');
      else addGenieBubble('assistant', '语音识别失败，试试文字输入吧');
    };
    genieRecognition.onend = () => stopGenieListening();
    genieRecognition.start();
    genieRecording = true;
    const btn = document.getElementById('genieVoiceBtn');
    btn.textContent = '⏹';
    btn.classList.add('recording');
  }catch(e){
    addGenieBubble('assistant', '语音识别启动失败，请用文字输入');
  }
}

function stopGenieListening(){
  genieRecording = false;
  if(genieRecognition){ try{ genieRecognition.stop(); }catch(e){} genieRecognition = null; }
  const btn = document.getElementById('genieVoiceBtn');
  btn.textContent = '🎤';
  btn.classList.remove('recording');
}

/* ---------------- 文字输入处理 ---------------- */
function submitGenieText(){
  const input = document.getElementById('genieInput');
  const text = input.value.trim();
  if(!text) return;
  input.value = '';
  addGenieBubble('user', text);
  processGenie(text);
}

function onGenieKeydown(ev){
  if(ev.key === 'Enter'){ ev.preventDefault(); submitGenieText(); }
}
function genieQuick(text){
  addGenieBubble('user', text);
  processGenie(text);
}

/* ---------------- 闲聊（寒暄 / 自我介绍 / 情感陪伴） ---------------- */
function pick(arr){ return arr[Math.floor(Math.random() * arr.length)]; }

function smallTalk(t){
  // 纯寒暄（整句匹配，避免误伤"你好，明天提醒我开会"这类带命令的话）
  if(/^(你好|你好呀|您好|嗨|哈喽|嗨喽|hello|hi|在吗|在不在|有人吗|早上好|早安|上午好|中午好|下午好|晚上好)[!！~～。.？?\s]*$/.test(t)){
    const hour = new Date().getHours();
    let greet;
    if(hour >= 5 && hour < 9) greet = '早上好';
    else if(hour >= 9 && hour < 12) greet = '上午好';
    else if(hour >= 12 && hour < 14) greet = '中午好';
    else if(hour >= 14 && hour < 18) greet = '下午好';
    else if(hour >= 18 && hour < 23) greet = '晚上好';
    else greet = '夜深了';
    return pick([
      `${greet}！我是绸缪精灵 🧚 有什么可以帮你的吗？`,
      `${greet}～ 我在呢。添加事件、换背景、查日程，都可以跟我说`,
      `${greet}！今天想让我做点什么？`,
      `${greet}！需要添加提醒或者查安排，直接说就行`
    ]);
  }

  // 自我介绍
  if(/你是谁|你叫什么|你的名字|介绍一下你|自我介绍|你是什么/.test(t)){
    return pick([
      '我是绸缪精灵 🧚 绸缪 App 的贴身助手：帮你记提醒、查日程，还能逛分享社区、筛选帖子、生成旅游攻略图、翻你的评论和攻略，随时吩咐～',
      '我叫绸缪精灵！既能打理提醒日程，也是你的旅行搭子：说"生成一份苏州攻略"我马上出图 🧳',
      '我是绸缪精灵呀 🧚 提醒、日程、社区、攻略、评论，一句话全搞定'
    ]);
  }

  // 道谢
  if(/谢谢|感谢|多谢|辛苦了|麻烦你|thanks|thank you|3q/.test(t)){
    return pick([
      '不客气～ 有需要随时叫我 😊',
      '应该的！还有什么能帮你的吗？',
      '别客气～ 我在呢',
      '能帮到你就好，不用谢～'
    ]);
  }

  // 道别
  if(/再见|拜拜|回见|晚安|先走了|我走了|bye|晚点聊/.test(t)){
    return pick([
      '再见啦～ 我会在这里等你回来 🧚',
      '拜拜～ 记得照顾好自己，别忘了重要的事哦',
      '回见！需要我的时候点右下角的精灵就行',
      '晚安好梦 🌙 明天见～'
    ]);
  }

  // 夸赞
  if(/你真棒|真厉害|好聪明|太棒了|不错|很好|优秀|好棒|牛逼|牛/.test(t)){
    return pick([
      '谢谢夸奖～ 我会继续努力的 😊',
      '嘿嘿，能帮到你就好～',
      '谢谢！有什么需要随时吩咐',
      '被你夸得有点不好意思啦～ 还有什么想做的吗？'
    ]);
  }

  // 情感陪伴
  if(/无聊|好烦|心情不好|难过|不开心|好累|压力大|emo|烦死了|郁闷|孤单/.test(t)){
    return pick([
      '抱抱你 🤗 要不要休息一下？或者我帮你把明天的安排理一理，让生活轻松点',
      '别难过～ 有我在呢。想散散心的话，我可以帮你换个清爽的背景色',
      '辛苦了 💪 记得给自己留点休息时间哦',
      '听起来今天有点难熬……跟我说说，或者让我帮你做点什么转移注意力？'
    ]);
  }

  // 是否开心 / 情感回应
  if(/开心|高兴|太好了|棒极了|快乐|哈哈/.test(t)){
    return pick([
      '太好啦！看到你开心我也很开心 🧚',
      '真为你高兴～ 今天一定是很棒的一天',
      '哈哈，心情好做什么都顺，需要我帮你记下这份快乐吗？'
    ]);
  }

  // 能力 / 帮助
  if(/你会什么|能做什么|怎么用|帮助|功能|有什么本事|你会干嘛|使用说明|技能/.test(t)){
    return genieHelpText();
  }

  return null;
}

/* ---------------- 意图解析 ---------------- */
async function processGenie(text){
  const t = text.toLowerCase().replace(/\s+/g, ' ').trim();

  // ① 清空全部事件
  if(/清空|删除(全部|所有)|清除(全部|所有)/.test(t) && (/事件|提醒|待办/.test(t) || !/背景|主题|语音|表情/.test(t))){
    if(!events.length){ addGenieBubble('assistant', '当前没有事件，无需清空哦～'); return; }
    const n = events.length;
    events.forEach(e => { if(isRecRef(e.voiceData)) mediaDel(e.voiceData); });
    events = []; persist(); renderAll(); renderBackupList();
    addGenieBubble('assistant', `已清空全部 ${n} 个事件 ✓`);
    return;
  }

  // ② 主题 / 背景（优先于"添加"，避免"设置深色模式"被误建为事件）
  if(/深色|暗色|夜间|黑暗/.test(t)){ setTheme('dark'); addGenieBubble('assistant', '已切换深色模式 ✓'); return; }
  if(/浅色|亮色|日间|白天/.test(t)){ setTheme('light'); addGenieBubble('assistant', '已切换浅色模式 ✓'); return; }
  if(/跟随系统|自动/.test(t) && /主题/.test(t)){ setTheme('system'); addGenieBubble('assistant', '已切换跟随系统主题 ✓'); return; }
  const bgMatch = t.match(/换背景|背景(颜色|色)?|底色/);
  if(bgMatch){
    const colorMap = {
      '绿':'#eef4f1','浅绿':'#eef4f1','绿色':'#eef4f1',
      '黄':'#fef3c7','浅黄':'#fef3c7','黄色':'#fef3c7','暖黄':'#fef3c7',
      '粉':'#fce7f3','粉色':'#fce7f3','粉红':'#fce7f3',
      '蓝':'#e0e7ff','蓝色':'#e0e7ff','浅蓝':'#e0e7ff',
      '红':'#fecaca','红色':'#fecaca','浅红':'#fecaca',
      '青':'#ccfbf1','青色':'#ccfbf1','浅青':'#ccfbf1',
      '紫':'#f5d0fe','紫色':'#f5d0fe','浅紫':'#f5d0fe',
    };
    let bgColor = null;
    for(const [key, val] of Object.entries(colorMap)){
      if(t.includes(key)){ bgColor = val; break; }
    }
    if(!bgColor){ addGenieBubble('assistant', '可选背景色：绿色、暖黄、粉色、蓝色、红色、青色、紫色。请说"换背景为粉色"'); return; }
    saveBgColor(bgColor);
    addGenieBubble('assistant', `背景已更换为 ${bgColor} ✓`);
    return;
  }

  // ②b 删除特定事件
  const delMatch = t.match(/删除(?:事件|提醒)?\s*(.+)/);
  if(delMatch && /删|移除/.test(t)){
    const keyword = delMatch[1].trim();
    const found = events.filter(e => e.name.includes(keyword) || keyword.includes(e.name));
    if(!found.length){ addGenieBubble('assistant', `没有找到包含「${keyword}」的事件`); return; }
    if(found.length === 1){
      const e = found[0];
      if(isRecRef(e.voiceData)) mediaDel(e.voiceData);
      events = events.filter(x => x.id !== e.id);
      persist(); renderAll(); renderBackupList();
      addGenieBubble('assistant', `已删除「${e.name}」✓`);
      return;
    }
    const list = found.map((e,i) => `${i+1}. ${e.name} (${e.date} ${e.time})`).join('\n');
    addGenieBubble('assistant', `找到多个匹配：\n${list}\n\n请告诉我要删除第几个，或者更精确的名称`);
    return;
  }

  // ③ 查询日程（今天/明天/后天/大后天/星期X/M月D日）——排除添加语句
  if(!/添加|新建|创建|设置|记录|生日|提醒我/.test(t) && /今天|今日|明天|明日|后天|大后天|星期|礼拜|周[一二三四五六日天]|月\d|\d+月\d+[日号]/.test(t) && (/有什么|事件|提醒|待办|安排|查询|查看|看看|日程|列表/.test(t) || /提醒$/.test(t))){
    const tgt = genieTargetDate(t);
    if(tgt){
      const dayEvents = events.filter(e => occursOn(e, tgt.date)).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
      if(!dayEvents.length){ addGenieBubble('assistant', `${tgt.label}暂无事件 ✨ 要添加一个吗？说"添加 ${tgt.label} …的事"就行`); return; }
      const lines = dayEvents.map(e => {
        const done = isDoneOn(e, tgt.date) ? ' ✅' : '';
        return `${e.time} · ${emojiIcon(e.emoji)} ${e.name}${done}`;
      });
      addGenieBubble('assistant', `${tgt.label}有 ${dayEvents.length} 个事件：\n${lines.join('\n')}`);
      return;
    }
  }

  // ④ 社区 / 攻略 / 评论技能（可能涉及云端，异步）
  const community = await genieCommunityIntent(t);
  if(community) return;

  // ⑤ 添加事件（触发词收紧：明确的创建动词，或"提醒我/提醒+时间"）
  const addTrigger = /(添加|新建|增加|创建|设置|记录)/.test(t) || /提醒我/.test(t) || /生日/.test(t) || ((/每天|每日|每周|工作日/.test(t)) && /\d{1,2}[点:：]|上午|下午|晚上|中午|早上/.test(t)) || (/提醒/.test(t) && /(今天|明天|后天|大后天|周[一二三四五六日天]|星期|每天|每日|\d{1,2}[点:：]|上午|下午|晚上|中午|早上)/.test(t));
  if(addTrigger){
    const result = parseAddEventIntent(text);
    if(result.error){ addGenieBubble('assistant', result.error); return; }
    const e = result.event;
    events.push(e);
    persist(); renderAll(); renderBackupList();
    const label = e.isBirthday ? '🎂 生日提醒' : '提醒';
    addGenieBubble('assistant', `${label}已保存：${e.name}\n${e.date} ${e.time}${(e.weekdays && e.weekdays.length) ? ' · ' + repeatLabel(e) : ''} ✓`);
    return;
  }

  // ⑥ 闲聊（寒暄/自我介绍/道谢/道别/情感陪伴/能力）
  const chat = smallTalk(t);
  if(chat){ addGenieBubble('assistant', chat); return; }

  // 未识别
  addGenieBubble('assistant', pick([
    '抱歉，我还不太懂这句话 😅 可以试试下面的快捷指令，或说"帮助"看全部技能',
    '嗯…这个我还没学会。要不试试"生成一份苏州攻略""看看我的评论"或"添加事件"？',
    '我没太理解～ 换个说法试试？比如"明天下午3点开会""看看苏州的美食"',
    '这个有点难住我了 🤔 你也可以说"帮助"看看我都会什么'
  ]));
}

function genieHelpText(){
  return '我现在会这些 🧚\n' +
    '⏰ 提醒日程\n• 添加："明天上午9点开会"、"每天晚上10点吃药"、"生日提醒 小美 5月20日"\n• 查询："今天/明天/周六/5月20日有什么安排"\n• 删除："删除开会"、清空全部\n\n' +
    '🧳 社区与攻略\n• "生成一份苏州攻略" → 自动出旅游攻略图\n• "看看苏州的美食/景点/娱乐" → 直接筛选帖子\n• "打开大众推荐 / 我的发布"\n• "看看我的评论"（可跳回原帖）\n• "我的旅游攻略"\n• "我发过几个帖子" 统计\n\n' +
    '🎨 个性化\n• "换背景为粉色"、深色/浅色模式\n\n也可以随时找我聊聊天～';
}

/* ---- 查询日期解析 ---- */
function genieTargetDate(t){
  const now = new Date();
  if(/大后天/.test(t)){ const d = new Date(now); d.setDate(d.getDate() + 3); return { date: todayStr(d), label: '大后天' }; }
  if(/后天/.test(t)){ const d = new Date(now); d.setDate(d.getDate() + 2); return { date: todayStr(d), label: '后天' }; }
  if(/明天|明日/.test(t)){ const d = new Date(now); d.setDate(d.getDate() + 1); return { date: todayStr(d), label: '明天' }; }
  if(/今天|今日/.test(t)) return { date: todayStr(), label: '今天' };
  const wk = t.match(/(?:星期|礼拜|周)([一二三四五六日天])/);
  if(wk){
    const map = { '一':1, '二':2, '三':3, '四':4, '五':5, '六':6, '日':7, '天':7 };
    const target = map[wk[1]];
    const cur = (now.getDay() === 0) ? 7 : now.getDay();
    let diff = (target - cur + 7) % 7;
    if(diff === 0) diff = 7;   // "周一"默认指下一个周一
    const d = new Date(now); d.setDate(d.getDate() + diff);
    return { date: todayStr(d), label: '下周' + wk[1] };
  }
  const md = t.match(/(\d{1,2})月(\d{1,2})[日号]/);
  if(md){
    let y = now.getFullYear();
    const d = new Date(y, parseInt(md[1]) - 1, parseInt(md[2]));
    if(d < new Date(now.getFullYear(), now.getMonth(), now.getDate())) d.setFullYear(y + 1);
    return { date: todayStr(d), label: `${parseInt(md[1])}月${parseInt(md[2])}日` };
  }
  return null;
}

/* ---- 社区/攻略意图（云端相关，返回 true 表示已处理） ---- */
function genieCityFromText(t){
  // 直辖市（两字简称即可，如"上海""北京"）
  for(const m of ['北京', '上海', '天津', '重庆']){
    if(t.indexOf(m) >= 0) return m + '市';
  }
  // 行政区划匹配（市层级；同时支持不带"市"的简称，如"苏州"）
  if(typeof divisions !== 'undefined' && divisions){
    for(const p of divisions){
      for(const c of (p.children || [])){
        if((c.name || '').length < 2) continue;
        if(t.indexOf(c.name) >= 0) return c.name;
        const bare = c.name.replace(/市$/, '');
        if(bare.length >= 2 && t.indexOf(bare) >= 0) return c.name;
      }
    }
  }
  // 兜底：XX市（完整带"市"才算，避免"苏州""杭州"等被动词短语误吞）
  const m2 = t.match(/([\u4e00-\u9fa5]{2,6}市)/);
  return m2 ? m2[1] : '';
}

async function genieCommunityIntent(t){
  try{ await loadDivisions(); }catch(e){}
  const hasSharePage = !!document.getElementById('shareList');

  // 我的评论
  if(/我的评论|我发的评论|看我?的?评论|评论列表/.test(t) || (/评论/.test(t) && /我的|看看|打开|查看/.test(t))){
    if(!(window.CloudAuth && CloudAuth.active() && CloudAuth.currentUser())){ addGenieBubble('assistant', '先登录才能看评论哦，点底部"我的"页登录一下～'); return true; }
    addGenieBubble('assistant', '马上带你去看看自己的评论 💬 点任意一条可以直接跳回原帖');
    try{ showPage('page-profile', document.querySelector('.tab[data-target=page-profile]')); }catch(e){}
    openMyComments();
    return true;
  }

  // 旅游攻略列表
  if(/(我的|看看|打开).*(旅游)?攻略|攻略列表/.test(t) && !/生成|做|来一份|规划图/.test(t)){
    if(!(window.CloudAuth && CloudAuth.active() && CloudAuth.currentUser())){ addGenieBubble('assistant', '先登录才能看攻略哦～'); return true; }
    addGenieBubble('assistant', '这就打开你的旅游攻略 🧳');
    try{ showPage('page-profile', document.querySelector('.tab[data-target=page-profile]')); }catch(e){}
    openPlansOverlay();
    return true;
  }

  // 生成攻略
  if(/(生成|做|来|出).{0,6}(攻略|行程规划|旅游图|规划图)|旅游攻略图/.test(t) && !/我的|看看/.test(t)){
    if(!(window.CloudAuth && CloudAuth.active() && CloudAuth.currentUser())){ addGenieBubble('assistant', '先登录才能生成攻略哦～'); return true; }
    const city = genieCityFromText(t);
    addGenieBubble('assistant', city ? ('好嘞，正在为你生成 ' + city + ' 的一日游攻略图 🧳 早餐→游玩→午餐→游玩→晚餐，马上安排！') : '没问题！请先选一个攻略城市 🧳');
    try{ showPage('page-share', document.querySelector('.tab[data-target=page-share]')); showShareTab('feed'); }catch(e){}
    if(city){
      setTimeout(() => { makeTravelPlan(city); }, 400);
    } else {
      setTimeout(() => { openPlanMaker(); }, 400);
    }
    return true;
  }

  // 帖子统计
  if(/(发过|发布过|发了).{0,3}(几个|多少).{0,2}(帖子|分享|贴)|帖子.{0,4}(多少|几个).{0,2}(赞|喜欢)|我.{0,2}赞.{0,3}多少/.test(t)){
    if(!(window.CloudAuth && CloudAuth.active() && CloudAuth.currentUser())){ addGenieBubble('assistant', '先登录后我才能帮你查数据哦～'); return true; }
    addGenieBubble('assistant', '正在翻你的发布记录… 📮');
    try{
      const r = await shareApi('mine', {});
      const list = (r && r.list) || [];
      if(!list.length){ addGenieBubble('assistant', '你还没有发布过帖子，去分享页点"＋发布"分享第一篇吧 🌱'); return true; }
      const likes = list.reduce((s, x) => s + (x.likes || 0), 0);
      const withPhoto = list.filter(x => (x.photos || []).length).length;
      addGenieBubble('assistant', `你一共发布过 ${list.length} 篇帖子 📮\n累计获得 ${likes} 个赞 ❤️\n带图帖子 ${withPhoto} 篇 📷\n最新一篇：${list[0].name || list[0].addr || '（无标题）'}`);
    }catch(e){
      addGenieBubble('assistant', '查询失败了，可能是网络抽风，稍后再试试～');
    }
    return true;
  }

  // 筛选帖子：看看/找/搜 + 类型（+城市）
  if(/看看|找|搜|推荐|想吃|想玩|想去|逛逛/.test(t) && /美食|好吃的|景点|好玩|娱乐|有趣/.test(t)){
    const type = /美食|好吃的/.test(t) ? '美食' : (/景点|好玩|想去/.test(t) ? '景点' : '娱乐');
    const city = genieCityFromText(t);
    if(!(window.CloudAuth && CloudAuth.active() && CloudAuth.currentUser())){ addGenieBubble('assistant', '先登录就能看社区的分享啦～'); return true; }
    if(!hasSharePage){ addGenieBubble('assistant', '分享社区还没准备好，稍等片刻再试试～'); return true; }
    try{ showPage('page-share', document.querySelector('.tab[data-target=page-share]')); showShareTab('feed'); }catch(e){}
    feedType = type;
    if(city){ feedCity = city; feedMode = 'city'; } else { feedMode = 'default'; }
    renderFeedFilter();
    addGenieBubble('assistant', city ? `已为你筛选 ${city} 的${type}分享 ${type === '美食' ? '🍜' : type === '景点' ? '🏞' : '🎡'}` : `已为你筛选${type}分享 ${type === '美食' ? '🍜' : type === '景点' ? '🏞' : '🎡'}，也可以在筛选条里再选城市`);
    setTimeout(() => { loadShare(true); }, 200);
    return true;
  }

  // 打开社区各页
  if(/打开.{0,4}(大众推荐|分享|社区)|去(逛)?(大众推荐|分享|社区)/.test(t) || t === '大众推荐'){
    if(!hasSharePage){ addGenieBubble('assistant', '分享社区还没准备好～'); return true; }
    try{ showPage('page-share', document.querySelector('.tab[data-target=page-share]')); showShareTab('feed'); }catch(e){}
    addGenieBubble('assistant', '大众推荐已打开 🛍 想看哪类分享直接告诉我，比如"看看苏州的美食"');
    return true;
  }
  if(/打开.{0,2}我的发布|我的发布在哪|看看我的发布|我的帖子列表/.test(t)){
    if(!(window.CloudAuth && CloudAuth.active() && CloudAuth.currentUser())){ addGenieBubble('assistant', '先登录后我才能带你去看发布哦～'); return true; }
    try{ showPage('page-share', document.querySelector('.tab[data-target=page-share]')); showShareTab('mine'); }catch(e){}
    addGenieBubble('assistant', '这是你的发布列表 📮');
    return true;
  }

  // 语音包
  if(/语音包|换语音|提示音/.test(t)){
    try{ openSettings(); }catch(e){}
    addGenieBubble('assistant', '已打开设置 🔔 里面可以试听和下载不同的提醒语音包');
    return true;
  }

  return false;
}

/* ---------------- 添加事件意图解析 ---------------- */
function parseAddEventIntent(text){
  const t = text.replace(/[，,]/g, ' ').replace(/\s+/g, ' ').trim();

  // 提取事件名称：去掉"添加/新建"等前缀词和日期时间后，剩余部分作为名称
  let name = t;
  name = name.replace(/^(添加|新建|增加|创建|设置|提醒)\s*(事件|一个|一下)?\s*/, '');
  name = name.replace(/\s*$/, '');

  // 提取时间
  let time = null;
  // 模式：HH:MM 或 HH点MM分 或 HH点 或 下午HH点
  const timeMatch = name.match(/(\d{1,2}):(\d{2})/);
  if(timeMatch){
    time = `${timeMatch[1].padStart(2,'0')}:${timeMatch[2]}`;
    name = name.replace(timeMatch[0], '');
  } else {
    const cnTimeMatch = name.match(/(下午|晚上|上午|中午|早上)?(\d{1,2})点(?:(\d{1,2})分)?/);
    if(cnTimeMatch){
      let h = parseInt(cnTimeMatch[2]);
      const period = cnTimeMatch[1] || '';
      if(period === '下午' && h !== 12) h += 12;
      if(period === '晚上' && h <= 12) h += 12;
      if(period === '中午' && h < 12) h += 12;
      const m = cnTimeMatch[3] ? parseInt(cnTimeMatch[3]) : 0;
      time = `${pad(h)}:${pad(m)}`;
      name = name.replace(cnTimeMatch[0], '');
    } else {
      time = '09:00'; // 默认上午9点
    }
  }

  // 提取日期
  let date = todayStr();
  const now = new Date();

  // 相对日期
  if(/明天|明日/.test(name)){ const d = new Date(now); d.setDate(d.getDate()+1); date = todayStr(d); name = name.replace(/明天|明日/, ''); }
  else if(/后天/.test(name)){ const d = new Date(now); d.setDate(d.getDate()+2); date = todayStr(d); name = name.replace(/后天/, ''); }
  else if(/大后天/.test(name)){ const d = new Date(now); d.setDate(d.getDate()+3); date = todayStr(d); name = name.replace(/大后天/, ''); }
  else if(/今天|今日/.test(name)){ name = name.replace(/今天|今日/, ''); }
  // 绝对日期：M月D日 或 M-D 或 YYYY-M-D
  const absDateMatch = name.match(/(\d{4})?[年-]?(\d{1,2})[月-](\d{1,2})[日号]?/);
  if(absDateMatch){
    const y = absDateMatch[1] ? parseInt(absDateMatch[1]) : now.getFullYear();
    const m = parseInt(absDateMatch[2]);
    const d = parseInt(absDateMatch[3]);
    date = `${y}-${pad(m)}-${pad(d)}`;
    name = name.replace(absDateMatch[0], '');
  }

  // 提取重复：每天 / 工作日 / 每周X（可多个）
  let weekdays = [];
  if(/每天|每日|天天/.test(name)){ weekdays = [1,2,3,4,5,6,7]; name = name.replace(/每天|每日|天天/g, ''); }
  else if(/工作日|上班日/.test(name)){ weekdays = [1,2,3,4,5]; name = name.replace(/工作日|上班日/g, ''); }
  else {
    const wds = name.match(/(?:每|每个|每周|每星期|每礼拜)([一二三四五六日天])/g) || name.match(/(?:星期|礼拜|周)([一二三四五六日天])/g);
    if(wds){
      const map = { '一':1, '二':2, '三':3, '四':4, '五':5, '六':6, '日':7, '天':7 };
      wds.forEach(w => { const d = map[w.slice(-1)]; if(d && !weekdays.includes(d)) weekdays.push(d); });
      name = name.replace(/(?:每|每个)?(?:星期|礼拜|周)[一二三四五六日天]/g, '');
    }
  }

  // 生日模式
  const isBd = /生日/.test(name);
  if(isBd) name = name.replace(/生日提醒|的生日|生日/g, '');

  // 清理名称
  name = name.replace(/[，,。！!？?]/g, ' ').replace(/\s+/g, ' ').trim();
  // 去开头结尾多余的"的"、"在"、"个"、"一个"
  name = name.replace(/^(的|在|个|一个|一下)\s*/, '').replace(/\s*(的|在)$/, '');

  if(!name || name.length < 2) return { error: '请说清楚事件名称，如"添加事件 明天下午3点开会"' };

  // 保证时间在今天之后
  if(date === todayStr() && time <= `${pad(now.getHours())}:${pad(now.getMinutes())}`){
    // 今天已过的时间 → 默认推到明天
    const d = new Date(now); d.setDate(d.getDate()+1); date = todayStr(d);
  }

  const event = {
    id: uid(),
    name: name.slice(0, 30),
    note: '',
    date,
    time,
    emoji: isBd ? '🎂' : EMOJIS[0],
    voice: VOICES[0],
    weekdays,
    isBirthday: isBd,
    doneOn: [],
    firedOn: []
  };

  return { event };
}