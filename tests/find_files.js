import fs from 'fs';

const html = fs.readFileSync('tests/drive_dump.html', 'utf8');

// Look for data-id="..."
const dataIdRegex = /data-id="([1a-zA-Z0-9_-]{28,})"/g;
let match;
const files = [];

while ((match = dataIdRegex.exec(html)) !== null) {
  const id = match[1];
  // Find context
  const pos = match.index;
  const chunk = html.substring(pos, pos + 1000);
  
  // Search for aria-label or filename or title
  // In Drive table row: aria-label="filename.ext" or similar
  const labelMatch = chunk.match(/aria-label="([^"]+)"/) || chunk.match(/data-tooltip="([^"]+)"/) || chunk.match(/title="([^"]+)"/);
  
  // Also search for any text node inside with .jpg, .png, etc.
  const nameMatch = chunk.match(/>([^<]+\.(jpg|jpeg|png|webp|mp4|pdf|svg))</i) || chunk.match(/"([^"]+\.(jpg|jpeg|png|webp|mp4|pdf|svg))"/i);

  files.push({
    id,
    label: labelMatch ? labelMatch[1] : null,
    name: nameMatch ? nameMatch[1] : null,
    chunk: chunk.slice(0, 300)
  });
}

console.log('Found rows:', files.length);
fs.writeFileSync('tests/drive_rows.json', JSON.stringify(files, null, 2), 'utf8');
console.log('Saved tests/drive_rows.json');
