import https from 'https';
import fs from 'fs';

const url = 'https://drive.google.com/drive/folders/1n06c43Rah1V2laadb4upb_vuj_4DwiU3?usp=drive_link';

https.get(url, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    fs.writeFileSync('tests/drive_dump.html', data, 'utf8');
    console.log('Saved drive_dump.html with length:', data.length);
    
    // Search for file patterns
    const regex = /\["([a-zA-Z0-9_-]{25,})",\["([^"]+)"/g;
    let match;
    const items = [];
    while ((match = regex.exec(data)) !== null) {
      items.push({ id: match[1], name: match[2] });
    }
    console.log('Total regex matches:', items.length);
    
    const imageFiles = items.filter(it => /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(it.name));
    console.log('Images found:', imageFiles.length);
    fs.writeFileSync('tests/drive_files.json', JSON.stringify(imageFiles.length ? imageFiles : items, null, 2), 'utf8');
    console.log('Saved to tests/drive_files.json');
  });
}).on('error', err => console.error(err));
