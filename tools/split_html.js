// 一次性工具：把单文件 index.html 拆分为 app/styles.css + app/*.js 模块
// 用法：node tools/split_html.js
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

// 1. 提取 CSS
const cssMatch = html.match(/<style>([\s\S]*?)<\/style>/);
if (!cssMatch) throw new Error('未找到 <style> 块');
const css = cssMatch[1].trim() + '\n';
fs.mkdirSync(path.join(root, 'app'), { recursive: true });
fs.writeFileSync(path.join(root, 'app', 'styles.css'), css);

// 2. 提取 JS 并按下文区块标题拆分
const jsMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (!jsMatch) throw new Error('未找到内联 <script> 块');
const js = jsMatch[1];

const SECTION_TO_FILE = {
  '数据层': 'core.js',
  '通用 UI': 'ui.js',
  '重复规则': 'core.js',
  '渲染：今天页': 'ui.js',
  '渲染：预告页': 'ui.js',
  '渲染：日历页': 'ui.js',
  '详情页': 'ui.js',
  '新建 / 编辑': 'editor.js',
  '自定义录音': 'editor.js',
  '到点提醒': 'reminder.js',
  '设置页操作': 'settings.js',
  '启动': 'main.js',
};

// split 保留分隔符：结果形如 [空白, "/* ---- 数据层 ---- */", "代码", "/* ---- ... */", ...]
const parts = js.split(/(\/\* -+ .+? -+ \*\/)/g);
const order = ['core.js', 'ui.js', 'editor.js', 'reminder.js', 'settings.js', 'main.js'];
const buckets = Object.fromEntries(order.map(f => [f, []]));

let current = null;
for (const part of parts) {
  const m = part.match(/\/\* -+ (.+?) -+ \*\//);
  if (m) {
    const title = m[1].trim();
    if (!(title in SECTION_TO_FILE)) throw new Error('未映射的区块标题: ' + title);
    current = SECTION_TO_FILE[title];
    buckets[current].push(part);
  } else if (current) {
    buckets[current].push(part);
  } else if (part.trim()) {
    throw new Error('存在未归属的代码片段: ' + part.slice(0, 80));
  }
}

const banner = {
  'core.js': '// 拾光 · 数据层与核心逻辑（常量、存储、重复规则、导入校验）',
  'ui.js': '// 拾光 · 通用 UI 与页面渲染（今天/预告/日历/详情）',
  'editor.js': '// 拾光 · 新建/编辑表单（chips、重复规则选择、自定义录音）',
  'reminder.js': '// 拾光 · 到点提醒（轮询、全屏弹层、语音播报、铃声、贪睡）',
  'settings.js': '// 拾光 · 设置页（导入导出、清空、离线语音包、主题与备份）',
  'main.js': '// 拾光 · 启动装配（渲染、时钟、轮询、音频预热）',
};

for (const f of order) {
  fs.writeFileSync(path.join(root, 'app', f), banner[f] + '\n' + buckets[f].join('') + '\n');
}

// 3. 生成新 index.html
const scriptTags = order
  .map(f => `  <script src="app/${f}"></script>`)
  .join('\n');
let out = html;
out = out.replace(/  <style>[\s\S]*?  <\/style>/, '  <link rel="stylesheet" href="app/styles.css" />');
out = out.replace(/<script>[\s\S]*?<\/script>/, scriptTags);
fs.writeFileSync(path.join(root, 'index.html'), out);

// 4. 报告
for (const f of order) {
  const size = fs.statSync(path.join(root, 'app', f)).size;
  console.log(`${f}: ${size} bytes`);
}
console.log('styles.css:', fs.statSync(path.join(root, 'app', 'styles.css')).size, 'bytes');
console.log('index.html:', fs.statSync(path.join(root, 'index.html')).size, 'bytes');
