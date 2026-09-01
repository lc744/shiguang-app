// 审计小程序所有相对 require 路径是否可解析（node tools/audit-requires.js）
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', 'miniprogram');
let bad = 0, total = 0;
function walk(dir){
  fs.readdirSync(dir, {withFileTypes:true}).forEach(d => {
    const p = path.join(dir, d.name);
    d.isDirectory() ? walk(p) : (p.endsWith('.js') && check(p));
  });
}
function check(f){
  const src = fs.readFileSync(f, 'utf8');
  const reqs = src.matchAll(/require\(['"]([^'"]+)['"]\)/g);
  for(const m of reqs){
    let spec = m[1];
    if(!spec.startsWith('.')) continue; // 插件 require 运行时容错，跳过
    total++;
    const resolved = path.resolve(path.dirname(f), spec);
    const candidates = [resolved, resolved + '.js', path.join(resolved, 'index.js')];
    if(!candidates.some(c => fs.existsSync(c))){
      console.log('✗ ' + path.relative(ROOT, f) + ' → ' + spec);
      bad++;
    }
  }
}
walk(ROOT);
console.log('相对 require 共 ' + total + ' 个，失败 ' + bad + ' 个');
