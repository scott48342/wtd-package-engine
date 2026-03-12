const fs = require('fs');
const path = require('path');

function listJs(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...listJs(p));
    else if (ent.isFile() && ent.name.endsWith('.js')) out.push(p);
  }
  return out;
}

function relFromSrc(p) {
  const srcRoot = path.resolve(__dirname, '..');
  return path.relative(srcRoot, p).split(path.sep).join('/');
}

const srcRoot = path.resolve(__dirname, '..');
const files = listJs(srcRoot);

const edges = [];
const re = /require\(['"]([^'"]+)['"]\)/g;

for (const f of files) {
  const txt = fs.readFileSync(f, 'utf8');
  let m;
  while ((m = re.exec(txt))) {
    const req = m[1];
    if (!req.startsWith('.')) continue;
    edges.push({ from: relFromSrc(f), req });
  }
}

console.log(JSON.stringify({ files: files.map(relFromSrc), edges }, null, 2));
