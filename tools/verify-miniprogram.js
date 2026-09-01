// 小程序工程完整性验证脚本（Node 运行：node tools/verify-miniprogram.js）
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..', 'miniprogram');
let errors = 0, warnings = 0;
const err = m => { console.log('✗ ' + m); errors++; };
const warn = m => { console.log('⚠ ' + m); warnings++; };
const ok = m => console.log('✓ ' + m);

// 1. app.json 声明的页面与文件一一对应
const appJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
appJson.pages.forEach(p => {
  ['js', 'wxml', 'json', 'wxss'].forEach(ext => {
    const f = path.join(ROOT, p + '.' + ext);
    if (fs.existsSync(f)) ok(p + '.' + ext);
    else err('缺失 ' + p + '.' + ext);
  });
});

// 2. tabBar 页面必须在 pages 里
(appJson.tabBar ? appJson.tabBar.list : []).forEach(t => {
  if (appJson.pages.includes(t.pagePath)) ok('tabBar: ' + t.pagePath);
  else err('tabBar 引用了未声明的页面 ' + t.pagePath);
});

// 3. theme.json / sitemap.json 存在且合法
['theme.json', 'sitemap.json', 'project.config.json'].forEach(f => {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) { err('缺失 ' + f); return; }
  try { JSON.parse(fs.readFileSync(p, 'utf8')); ok(f + ' (JSON)'); }
  catch (e) { err(f + ' JSON 解析失败: ' + e.message); }
});

// 4. 所有页面/组件 json 合法 + usingComponents 引用存在
function walk(dir, cb) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(d => {
    const p = path.join(dir, d.name);
    d.isDirectory() ? walk(p, cb) : cb(p);
  });
}
walk(ROOT, f => {
  if (!f.endsWith('.json')) return;
  if (/theme\.json|sitemap\.json|project\.config\.json$/.test(f)) return;
  try {
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    ok(path.relative(ROOT, f) + ' (JSON)');
    if (j.usingComponents) Object.entries(j.usingComponents).forEach(([name, p]) => {
      // 支持两种写法：相对页面目录的相对路径、以 / 开头的项目根绝对路径（小程序均合法）
      const base = p.startsWith('/') ? path.join(ROOT, p.slice(1)) : path.join(path.dirname(f), p);
      if (!fs.existsSync(base + '.js')) err(f + ' 引用的组件不存在: ' + p);
      else ok('  组件 ' + name + ' → ' + p);
    });
  } catch (e) { err(path.relative(ROOT, f) + ' JSON 解析失败: ' + e.message); }
});

// 5. 所有 JS 语法检查（node --check）
walk(ROOT, f => {
  if (!f.endsWith('.js')) return;
  try { execSync('node --check "' + f + '"', { stdio: 'pipe' }); ok(path.relative(ROOT, f) + ' (语法)'); }
  catch (e) { err(path.relative(ROOT, f) + ' 语法错误: ' + e.stderr.toString().split('\n')[0]); }
});

// 6. WXML bind 的事件处理函数在对应 js 中存在
walk(ROOT, f => {
  if (!f.endsWith('.wxml')) return;
  const js = f.replace(/\.wxml$/, '.js');
  if (!fs.existsSync(js)) return;
  const jsSrc = fs.readFileSync(js, 'utf8');
  const wxml = fs.readFileSync(f, 'utf8');
  const handlers = new Set();
  (wxml.match(/\b(?:bind|catch)[:a-z]*="[^"]+"/g) || []).forEach(m => {
    const h = m.match(/="([^"]+)"/)[1];
    if (h && !/^(true|false)$/.test(h) && !h.includes(' ')) handlers.add(h);
  });
  handlers.forEach(h => {
    const re = new RegExp('(\\b' + h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b\\s*[:(=])|(\\"' + h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\")');
    if (re.test(jsSrc)) ok(path.relative(ROOT, f) + ' → ' + h);
    else err(path.relative(ROOT, f) + ' 引用了 js 中不存在的方法: ' + h);
  });
});

// 7. WXML 基础标签平衡
walk(ROOT, f => {
  if (!f.endsWith('.wxml')) return;
  const src = fs.readFileSync(f, 'utf8');
  const opens = (src.match(/<view\b/g) || []).length;
  const closes = (src.match(/<\/view>/g) || []).length;
  const selfClose = (src.match(/<view[^>]*\/>/g) || []).length;
  if (opens - selfClose !== closes) err(path.relative(ROOT, f) + ' view 标签不平衡: open=' + opens + ' close=' + closes);
  else ok(path.relative(ROOT, f) + ' (view 平衡)');
});

// 8. 图片资源引用存在
walk(ROOT, f => {
  if (!f.endsWith('.wxml') && !f.endsWith('.js')) return;
  const src = fs.readFileSync(f, 'utf8');
  (src.match(/["'(]\/images\/[^"')\s]+/g) || []).forEach(m => {
    const p = path.join(ROOT, m.replace(/^["'(]/, ''));
    if (fs.existsSync(p)) ok('图片存在 ' + m.replace(/^["'(]/, ''));
    else err(path.relative(ROOT, f) + ' 引用了不存在的图片 ' + m);
  });
});

console.log('\n==============================');
console.log('错误: ' + errors + '，警告: ' + warnings);
process.exit(errors ? 1 : 0);
