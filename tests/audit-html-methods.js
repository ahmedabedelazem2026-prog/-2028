import fs from 'fs';
const app = fs.readFileSync('js/app.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

const regex = /window\.app\.([a-zA-Z0-9_]+)/g;
let m;
const htmlMethods = new Set();
while ((m = regex.exec(html)) !== null) {
  htmlMethods.add(m[1]);
}

const missingInApp = [];
for (const method of htmlMethods) {
  // Check if method is defined as method() { or async method() { or this.method = or app.method =
  const pattern = new RegExp(`(^|\\s)${method}\\s*\\(`, 'm');
  if (!pattern.test(app) && !app.includes(`this.${method}`) && !app.includes(`.${method} =`)) {
    missingInApp.push(method);
  }
}

console.log('Total methods called from HTML:', htmlMethods.size);
console.log('Methods missing in app.js:', missingInApp);
