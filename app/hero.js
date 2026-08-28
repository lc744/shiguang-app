// 拾光 · 首页幻灯片介绍区

/* ---------------- 幻灯片数据 ---------------- */
const HERO_QUOTES = [
  {
    title: "拾光",
    subtitle: "让提醒不只是响一下",
    text: "到点准时提醒，给你更有温度的陪伴。"
  },
  {
    title: "今日寄语",
    subtitle: "千里之行，始于足下",
    text: "每一步都是新的开始，每一次行动都在改变未来。今天也要加油哦！✨"
  },
  {
    title: "古风·励志",
    subtitle: "长风破浪会有时",
    text: "直挂云帆济沧海——总有一天，你会实现心中的梦想。🌊"
  },
  {
    title: "温暖鼓励",
    subtitle: "每一天都是新的礼物",
    text: "不要担心明天会发生什么，只要认真对待今天就好～ 🎁"
  },
  {
    title: "经典名句",
    subtitle: "学而不思则罔，思而不学则殆",
    text: "学习与思考并重，才能进步更快。今天也要努力吸收新知识呀！📚"
  },
  {
    title: "元气满满",
    subtitle: "阳光总在风雨后",
    text: "所有经历都会成为你的财富，坚持下去就是胜利！☀️"
  },
  {
    title: "哲理名言",
    subtitle: "不积跬步，无以至千里",
    text: "小小的积累终将带来大大的改变，今天的你比昨天又进步了呢 🐾"
  }
];

/* ---------------- 装饰图案库 ---------------- */
const HERO_DECORATIONS = [
  // 小动物 emoji 组合
  '🐱', '🐶', '🐰', '🦊', '🐼', '🐨', '🐯', '🦁', 
  '🐸', '🐵', '🦄', '🦉', '🦋', '🐞', '🐢', '🦥'
];

let currentSlideIndex = 0;
let slideInterval = null;

/* ---------------- 幻灯片逻辑 ---------------- */
function initHeroSlideshow(){
  renderDecoration();
  // 先设置初始内容
  showSlide(0);
  
  if(slideInterval) clearInterval(slideInterval);
  // 5 秒自动切换
  slideInterval = setInterval(() => { nextSlide(); }, 5000);
}

function renderDecoration(){
  const el = document.getElementById('heroDecoration');
  if(!el) return;
  const randomDecor = HERO_DECORATIONS[Math.floor(Math.random() * HERO_DECORATIONS.length)];
  el.innerHTML = `
    <div class="decoration-item">${randomDecor}</div>
  `;
}

function showSlide(index){
  const textEl = document.getElementById('heroText');
  const catEl = document.getElementById('heroCat');
  const mainTitle = document.getElementById('heroMainTitle');
  const descEl = document.getElementById('heroDesc');
  
  if(!textEl || !catEl || !mainTitle || !descEl) return;
  
  currentSlideIndex = index;
  const data = HERO_QUOTES[index % HERO_QUOTES.length];
  
  // 淡出 → 更新文字 → 淡入
  textEl.style.opacity = '0';
  setTimeout(() => {
    catEl.textContent = data.title;        // 小分类标签：拾光 / 今日寄语 / 古风·励志…
    mainTitle.textContent = data.subtitle; // 主句：励志语句 / 古诗词
    descEl.textContent = data.text;        // 释义与鼓励文字
    textEl.style.opacity = '1';
  }, 300);
  
  // 每 7 次更换装饰图案
  if(index % 7 === 0) renderDecoration();
}

function nextSlide(){
  const maxIndex = HERO_QUOTES.length - 1;
  const next = (currentSlideIndex + 1) % (maxIndex + 1);
  showSlide(next);
}

function prevSlide(){
  const next = (currentSlideIndex - 1 + HERO_QUOTES.length) % HERO_QUOTES.length;
  showSlide(next);
}

/* ---------------- 暴露到全局 ---------------- */
window.initHeroSlideshow = initHeroSlideshow;
window.nextSlide = nextSlide;
window.prevSlide = prevSlide;
