// 拾光精灵 · 智能语音/文字助手
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
    addGenieBubble('assistant', '你好呀！我是拾光精灵 🧚 你可以用语音或文字告诉我：\n• 添加事件 明天下午3点开会\n• 删除测试事件\n• 清空全部事件\n• 换背景为粉色\n• 切换深色模式\n• 今天有什么事件');
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
      if(ev.error === 'not-allowed') addGenieBubble('assistant', '麦克风权限未开启，请在系统设置中允许拾光使用麦克风');
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

  // 你好 / 帮助
  if(/你好|嗨|哈喽|帮助|怎么用|能做什么|功能/.test(t)){
    addGenieBubble('assistant', '我可以帮你：\n• 添加事件（如"明天上午9点开会"）\n• 删除事件（如"删除开会"）\n• 清空全部事件\n• 换背景色（如"换背景为粉色"）\n• 切换深色/浅色模式\n• 查询今天的事件');
    return;
  }

  // 未识别
  addGenieBubble('assistant', '抱歉，我没有理解你的意思 😅\n你可以说：\n• "添加事件 明天下午3点开会"\n• "换背景为粉色"\n• "今天有什么事件"');
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