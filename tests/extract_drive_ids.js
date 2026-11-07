import fs from 'fs';

const html = fs.readFileSync('tests/drive_dump.html', 'utf8');

// Notice: ssk='5:auSv137:1sIqY5tTenH-naiRThLyFLzg7lp0VOYeM-0-1'
// Notice: Storage used: 683 كيلوبايت
// In Google Drive HTML, files are often stored in JS data or DOM with their IDs and names.
// Let's find all occurrences of drive file IDs (usually 33 characters, like 1sIqY5tTenH-naiRThLyFLzg7lp0VOYeM)
const idRegex = /1[a-zA-Z0-9_-]{32}/g;
const ids = [...new Set(html.match(idRegex) || [])];
console.log('Unique Drive IDs found:', ids.length);

// Let's search around these IDs to find the filename
const fileMap = [];
for (const id of ids) {
  const pos = html.indexOf(id);
  if (pos !== -1) {
    const snippet = html.substring(Math.max(0, pos - 200), Math.min(html.length, pos + 400));
    // Check if snippet contains filename or extension
    fileMap.push({ id, snippet: snippet.replace(/\s+/g, ' ') });
  }
}

fs.writeFileSync('tests/drive_extracted_ids.json', JSON.stringify(fileMap, null, 2), 'utf8');
console.log('Wrote tests/drive_extracted_ids.json');
