import fs from 'fs';
const app = fs.readFileSync('js/app.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

const regex = /getElementById\(['"]([^'"]+)['"]\)/g;
let m;
const appIds = new Set();
while ((m = regex.exec(app)) !== null) {
  appIds.add(m[1]);
}

const missing = [];
for (const id of appIds) {
  const p1 = 'id="' + id + '"';
  const p2 = "id='" + id + "'";
  if (!html.includes(p1) && !html.includes(p2)) {
    missing.push(id);
  }
}
console.log('Total IDs queried in app.js:', appIds.size);
console.log('Missing in HTML:', JSON.stringify(missing, null, 2));
