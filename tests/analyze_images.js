import fs from 'fs';
import path from 'path';

// Read all files in assets/images
const files = fs.readdirSync('assets/images');

function getJpegDimensions(buffer) {
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xFF) break;
    const marker = buffer[offset + 1];
    if (marker === 0xC0 || marker === 0xC2) { // SOF0 or SOF2
      const height = buffer.readUInt16BE(offset + 5);
      const width = buffer.readUInt16BE(offset + 7);
      return { width, height };
    }
    const length = buffer.readUInt16BE(offset + 2);
    offset += 2 + length;
  }
  return null;
}

const report = [];

for (const file of files) {
  const fullPath = path.join('assets/images', file);
  const stat = fs.statSync(fullPath);
  if (stat.isFile() && /\.(jpg|jpeg|png)$/i.test(file)) {
    const buf = fs.readFileSync(fullPath);
    let dims = null;
    if (/\.(jpg|jpeg)$/i.test(file)) {
      dims = getJpegDimensions(buf);
    } else if (/\.png$/i.test(file)) {
      dims = { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    report.push({
      file,
      sizeKB: (stat.size / 1024).toFixed(1),
      width: dims ? dims.width : 'unknown',
      height: dims ? dims.height : 'unknown',
      aspectRatio: dims ? (dims.width / dims.height).toFixed(2) : 'unknown',
      orientation: dims ? (dims.width > dims.height ? 'Landscape' : (dims.width === dims.height ? 'Square' : 'Portrait')) : 'unknown'
    });
  }
}

fs.writeFileSync('tests/image_metadata_full.json', JSON.stringify(report, null, 2), 'utf8');
console.log(`Analyzed ${report.length} images.`);
const nonWa = report.filter(r => !r.file.startsWith('WhatsApp'));
console.log('Core images:', nonWa);
