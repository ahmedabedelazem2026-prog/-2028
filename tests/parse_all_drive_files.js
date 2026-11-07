import fs from 'fs';

const html = fs.readFileSync('tests/drive_dump.html', 'utf8');

// Look for data-tooltip="<filename> Image" or <strong class="DNoYtb"><filename></strong>
// with its corresponding data-id
const regex = /data-id="([1a-zA-Z0-9_-]{28,})"[\s\S]*?<strong class="DNoYtb">([^<]+)<\/strong>/g;

// Or simpler: match all data-id and the strong tag following it
const items = new Map();

// Let's split by <tr or role="row"
const rows = html.split(/role="row" draggable="true"/);
console.log('Total table rows split:', rows.length);

for (let i = 1; i < rows.length; i++) {
  const row = rows[i];
  const idMatch = row.match(/data-id="([1a-zA-Z0-9_-]{28,})"/);
  const nameMatch = row.match(/<strong class="DNoYtb">([^<]+)<\/strong>/);
  const sizeMatch = row.match(/Storage used: ([^"]+)"/);
  
  if (idMatch && nameMatch) {
    const id = idMatch[1];
    const name = nameMatch[1].trim();
    const size = sizeMatch ? sizeMatch[1].trim() : 'Unknown';
    items.set(id, { id, name, size });
  }
}

console.log('Distinct files in Drive folder:', items.size);
const fileList = Array.from(items.values());
fs.writeFileSync('tests/drive_unique_files.json', JSON.stringify(fileList, null, 2), 'utf8');

fileList.forEach((f, idx) => {
  console.log(`${idx + 1}. [${f.id}] ${f.name} (${f.size})`);
});
