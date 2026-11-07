import fs from 'fs';
const html = fs.readFileSync('tests/drive_dump.html', 'utf8');
const regex = /class="DNoYtb">([^<]+)<\/strong>/g;
let m;
const list = [];
while ((m = regex.exec(html)) !== null) {
  list.push(m[1].trim());
}
console.log('Total matches:', list.length);
const unique = [...new Set(list)];
console.log('Unique names:', unique.length);

const localFiles = fs.readdirSync('assets/images');
console.log('Local files count:', localFiles.length);

let found = 0;
let missing = [];
for (const u of unique) {
  if (localFiles.includes(u)) {
    found++;
  } else {
    missing.push(u);
  }
}
console.log(`Matched locally: ${found} / ${unique.length}`);
console.log('Missing locally:', missing);
