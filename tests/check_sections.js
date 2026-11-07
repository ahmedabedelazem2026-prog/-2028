import fs from 'fs';
const html = fs.readFileSync('index.html', 'utf8');

const checks = [
  'authModal',
  'loginModal',
  'driverSection',
  'driverApp',
  'driverTab',
  'adminSection',
  'adminTabs',
  'campaigns',
  'adsBanner',
  'promoBanner'
];

for (const c of checks) {
  console.log(`${c}: ${html.includes(c)}`);
}
