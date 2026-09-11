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
    addGenieBubble('assistant', '你好呀，我是绸缪精灵 🧚 可以陪你聊天，也能帮你添加提醒、换背景、查日程。试试对我说"明天上午9点开会"，或者随便跟我聊聊～');
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
      '我是绸缪精灵 🧚 你的贴身小助手。我能帮你添加事件提醒、换背景色、切换主题、查询日程，还能陪你聊聊天～',
      '我叫绸缪精灵，是绸缪 App 里的智能助手，专门帮你打理提醒和日程，有什么需要尽管说～',
      '我是绸缪精灵呀 🧚 负责让你不错过任何重要的事，也能陪你解解闷'
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
  if(/你会什么|能做什么|怎么用|帮助|功能|有什么本事|你会干嘛|使用说明/.test(t)){
    return '我可以帮你：\n• 添加事件（"明天上午9点开会"）\n• 删除事件（"删除开会"）\n• 清空全部事件\n• 换背景色（"换背景为粉色"）\n• 切换深色/浅色模式\n• 查询今天/明天的事件\n\n也可以陪你闲聊～ 试试说"你好""谢谢""晚安"';
  }

  return null;
}

/* ---------------- 意图解析 ---------------- */
function processGenie(text){
  const t = text.toLowerCase().replace(/\s+/g, ' ').trim();

  // 清空全部事件
  if(/清空|删除(全部|所有)|清除(全部|所有)/.test(t) && (/事件|提醒|待办/.test(t) || !/背景|主题|语音|表情/.test(t))){
    if(!events.length){ addGenieBubble('assistant', '当前没有事件，无需清空哦～'); return; }
    const n = events.length;
    events.forEach(e => { if(isRecRef(e.voiceData)) mediaDel(e.voiceData); });
    events = []; persist(); renderAll(); renderBackupList();
    addGenieBubble('assistant', `已清空全部 ${n} 个事件 ✓`);
    return;
  }

  // 删除特定事件
  const delMatch = t.match(/删除(?:事件)?\s*(.+)/);
  if(delMatch){
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
    // 多个匹配：列出让用户选择
    const list = found.map((e,i) => `${i+1}. ${e.name} (${e.date} ${e.time})`).join('\n');
    addGenieBubble('assistant', `找到多个匹配：\n${list}\n\n请告诉我要删除第几个，或者更精确的名称`);
    return;
  }

  // 添加事件（核心功能）
  const addMatch = t.match(/添加|新建|增加|创建|设置|提醒/);
  if(addMatch){
    const result = parseAddEventIntent(t);
    if(result.error){ addGenieBubble('assistant', result.error); return; }
    const e = result.event;
    events.push(e);
    persist(); renderAll(); renderBackupList();
    const label = e.isBirthday ? '🎂 生日提醒' : '提醒';
    addGenieBubble('assistant', `${label}已保存：${e.name}\n${e.date} ${e.time}${e.weekdays.length ? ' · ' + repeatLabel(e) : ''} ✓`);
    return;
  }

  // 换背景色
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

  // 切换主题
  if(/深色|暗色|夜间|黑暗/.test(t)){ setTheme('dark'); addGenieBubble('assistant', '已切换深色模式 ✓'); return; }
  if(/浅色|亮色|日间|白天/.test(t)){ setTheme('light'); addGenieBubble('assistant', '已切换浅色模式 ✓'); return; }
  if(/跟随系统|自动/.test(t) && /主题/.test(t)){ setTheme('system'); addGenieBubble('assistant', '已切换跟随系统主题 ✓'); return; }

  // 查询今日事件
  if(/今天|今日/.test(t) && (/有什么|事件|提醒|待办|安排/.test(t) || /查询|查看|看看/.test(t))){
    const tds = todayStr();
    const todayEvents = events.filter(e => occursOn(e, tds));
    if(!todayEvents.length){ addGenieBubble('assistant', `${dateLabel(tds)}暂无事件 ✨`); return; }
    const lines = todayEvents.map(e => {
      const done = isDoneOn(e, tds) ? ' ✅' : '';
      return `${e.time} · ${emojiIcon(e.emoji)} ${e.name}${done}`;
    });
    addGenieBubble('assistant', `${dateLabel(tds)}有 ${todayEvents.length} 个事件：\n${lines.join('\n')}`);
    return;
  }

  // 闲聊（寒暄/自我介绍/道谢/道别/情感陪伴/能力）
  const chat = smallTalk(t);
  if(chat){ addGenieBubble('assistant', chat); return; }

  // 未识别
  addGenieBubble('assistant', pick([
    '抱歉，我还不太懂这句话 😅 你可以试试说"明天上午9点开会"或"换背景为粉色"',
    '嗯…这个我还没学会。要不试试让我"添加事件""查今天安排"或"换背景色"？',
    '我没太理解～ 换个说法试试？比如"提醒我明天下午3点开会"',
    '这个有点难住我了 🤔 你也可以直接问"今天有什么事件"'
  ]));
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
    emoji: EMOJIS[0],
    voice: VOICES[0],
    weekdays: [],
    doneOn: [],
    firedOn: []
  };

  return { event };
}