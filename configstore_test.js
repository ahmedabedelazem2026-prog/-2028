const Configstore = require('configstore');
const cs = new Configstore('firebase-tools');
const orig = cs.get('lastUpdateCheck');
console.log('ORIG', JSON.stringify(orig));
try {
  cs.set('lastUpdateCheck', Date.now());
  console.log('WRITE_OK');
  cs.set('lastUpdateCheck', orig);
  console.log('RESTORE_OK');
} catch (e) {
  console.log('EXCEPTION', e.name, e.code || 'N/A', e.message);
  process.exit(1);
}
