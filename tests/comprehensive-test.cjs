/**
 * CAPITAL TAXI – Comprehensive Platform Test Suite
 * Tests image paths, HTML structure, JS functions, responsive elements
 * Run: node tests/comprehensive-test.js
 */
const fs = require('fs');
const path = require('path');

const PROJECT = path.resolve(__dirname, '..');
const results = { passed: 0, failed: 0, warnings: 0, details: [] };

function log(status, category, message) {
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  results.details.push({ status, category, message });
  if (status === 'PASS') results.passed++;
  else if (status === 'FAIL') results.failed++;
  else results.warnings++;
  console.log(`${icon} [${category}] ${message}`);
}

// ═══════════════════════════════════════════
// 1. IMAGE PATH VERIFICATION
// ═══════════════════════════════════════════
console.log('\n═══════ 1. IMAGE PATHS ═══════\n');

const html = fs.readFileSync(path.join(PROJECT, 'index.html'), 'utf8');

// Extract all image src paths (excluding template literals)
const srcMatches = html.match(/src=["']([^"']*?\/assets\/images\/[^"']+)["']/g) || [];
const imgPaths = new Set();
srcMatches.forEach(m => {
  const p = m.match(/src=["']([^"']+)["']/);
  if (p && !p[1].includes('${')) imgPaths.add(p[1]);
});

// Extract onerror fallback paths
const onerrorMatches = html.match(/this\.src='([^']+)'/g) || [];
onerrorMatches.forEach(m => {
  const p = m.match(/this\.src='([^']+)'/);
  if (p) imgPaths.add(p[1]);
});

const uniquePaths = [...imgPaths];
console.log(`Found ${uniquePaths.length} unique image references\n`);

uniquePaths.forEach(imgPath => {
  const fsPath = path.join(PROJECT, imgPath.replace(/^\//, ''));
  if (fs.existsSync(fsPath)) {
    const stat = fs.statSync(fsPath);
    log('PASS', 'IMAGE', `${imgPath} (${(stat.size / 1024).toFixed(0)} KB)`);
  } else {
    log('FAIL', 'IMAGE', `MISSING: ${imgPath}`);
  }
});

// Check icon reference
const iconPath = path.join(PROJECT, 'icons', 'icon-192.png');
if (fs.existsSync(iconPath)) {
  log('PASS', 'IMAGE', '/icons/icon-192.png exists');
} else {
  log('WARN', 'IMAGE', '/icons/icon-192.png NOT found (PWA icon)');
}

// ═══════════════════════════════════════════
// 2. HTML STRUCTURE VERIFICATION
// ═══════════════════════════════════════════
console.log('\n═══════ 2. HTML STRUCTURE ═══════\n');

// Check all 4 views exist
const views = ['view-landing', 'view-customer', 'view-driver', 'view-admin'];
views.forEach(v => {
  if (html.includes(`id="${v}"`)) {
    log('PASS', 'HTML', `View "${v}" exists`);
  } else {
    log('FAIL', 'HTML', `View "${v}" MISSING`);
  }
});

// Check modals
const modals = ['authModal', 'chatModal', 'ratingModal', 'scheduleModal', 'safetyModal',
  'driverPinModal', 'walletModal', 'pricingModal', 'deviceModeModal', 'otpModal',
  'historyModal', 'notificationsModal', 'profileModal', 'settingsModal', 'supportModal', 'promosModal'];
modals.forEach(m => {
  if (html.includes(`id="${m}"`)) {
    log('PASS', 'HTML', `Modal "${m}" present`);
  } else {
    log('FAIL', 'HTML', `Modal "${m}" MISSING`);
  }
});

// Check key form elements
const keyElements = [
  'inputPickup', 'inputDropoff', 'inputTripNotes', 'inputCoupon',
  'inputCustomerName', 'inputCustomerPhone', 'btnConfirmRideMain',
  'loginEmail', 'loginPassword', 'regName', 'regPhone', 'regEmail', 'regPassword', 'regRole',
  'driverOnlineToggle', 'customerSearchingCard', 'customerTripStatusCard',
  'incomingTripCard', 'driverActiveTripCard',
  'adminTotalTrips', 'adminActiveTrips', 'adminCompletedTrips', 'adminTotalDrivers',
  'adminOnlineDrivers', 'adminTotalUsers', 'adminTotalRevenue', 'adminCommission'
];
keyElements.forEach(el => {
  if (html.includes(`id="${el}"`)) {
    log('PASS', 'HTML', `Element #${el} present`);
  } else {
    log('FAIL', 'HTML', `Element #${el} MISSING`);
  }
});

// ═══════════════════════════════════════════
// 3. JAVASCRIPT FUNCTIONS CHECK
// ═══════════════════════════════════════════
console.log('\n═══════ 3. JAVASCRIPT FUNCTIONS ═══════\n');

const appJs = fs.readFileSync(path.join(PROJECT, 'js', 'app.js'), 'utf8');

const requiredFunctions = [
  'switchView', 'requestRide', 'detectUserGpsLocation', 'updateRouteAndFare',
  'login', 'register', 'selectAlArishLandmark', 'cancelCustomerSearching',
  'shareTripWhatsApp', 'cancelActiveTripCustomer', 'sendChatMessage',
  'submitDriverRating', 'selectTip', 'confirmScheduledRide',
  'completeActiveTrip', 'markDriverArrived', 'promptDriverPinAndStart',
  'confirmDriverPinAndStart', 'setDeviceMode', 'showToast',
  'renderTripHistory', 'refreshUserWalletUI', 'submitComplaint',
  'exportReportToCSV', 'saveProfileInfo', 'resetMapToCenter',
  'applyCouponDirect', 'setQuickFavorite', 'topUpUserWallet',
  'verifyOtpCode', 'handleOtpInput'
];

requiredFunctions.forEach(fn => {
  if (appJs.includes(fn)) {
    log('PASS', 'JS', `Function/method "${fn}" found in app.js`);
  } else {
    log('WARN', 'JS', `Function/method "${fn}" NOT found in app.js`);
  }
});

// Check inline script functions
const inlineFunctions = ['showAuthTab', 'toggleDriverRegisterFields', 'handleLoginSubmit',
  'handleRegisterSubmit', 'saveAdminPricingConfig', 'switchAdminSection', 'filterAdminTable'];
inlineFunctions.forEach(fn => {
  if (html.includes(`function ${fn}`)) {
    log('PASS', 'JS', `Inline function "${fn}" present in HTML`);
  } else {
    log('FAIL', 'JS', `Inline function "${fn}" MISSING from HTML`);
  }
});

// ═══════════════════════════════════════════
// 4. CSS VERIFICATION
// ═══════════════════════════════════════════
console.log('\n═══════ 4. CSS DESIGN SYSTEM ═══════\n');

const designCss = fs.readFileSync(path.join(PROJECT, 'css', 'design-system.css'), 'utf8');

const requiredCssVars = ['--color-bg-primary', '--color-surface', '--color-surface-elev',
  '--color-gold', '--color-gold-light', '--color-success', '--color-warning', '--color-error',
  '--color-text-primary', '--font-sans'];
requiredCssVars.forEach(v => {
  if (designCss.includes(v)) {
    log('PASS', 'CSS', `Variable "${v}" defined`);
  } else {
    log('FAIL', 'CSS', `Variable "${v}" MISSING`);
  }
});

// RTL check
if (designCss.includes('direction: rtl') || designCss.includes('direction:rtl')) {
  log('PASS', 'CSS', 'RTL direction set');
} else {
  log('WARN', 'CSS', 'RTL direction not found in design-system.css');
}

// Dark theme check
if (designCss.includes('#0B0F16')) {
  log('PASS', 'CSS', 'Dark background #0B0F16 present');
} else {
  log('FAIL', 'CSS', 'Dark background #0B0F16 MISSING');
}

// ═══════════════════════════════════════════
// 5. FIREBASE CONFIG VERIFICATION
// ═══════════════════════════════════════════
console.log('\n═══════ 5. FIREBASE CONFIG ═══════\n');

const fbJson = JSON.parse(fs.readFileSync(path.join(PROJECT, 'firebase.json'), 'utf8'));
if (fbJson.hosting && fbJson.hosting.public) {
  log('PASS', 'FIREBASE', `Hosting public dir: "${fbJson.hosting.public}"`);
} else {
  log('FAIL', 'FIREBASE', 'No hosting.public in firebase.json');
}
if (fbJson.hosting && fbJson.hosting.rewrites) {
  log('PASS', 'FIREBASE', 'Rewrites configured');
} else {
  log('WARN', 'FIREBASE', 'No rewrites in firebase.json');
}

// ═══════════════════════════════════════════
// 6. RESPONSIVE ELEMENTS CHECK
// ═══════════════════════════════════════════
console.log('\n═══════ 6. RESPONSIVE LAYOUT ═══════\n');

if (html.includes('mobile-bottom-nav')) {
  log('PASS', 'RESPONSIVE', 'Mobile bottom navigation bar present');
} else {
  log('FAIL', 'RESPONSIVE', 'Mobile bottom nav MISSING');
}
if (html.includes('device-switcher-bar')) {
  log('PASS', 'RESPONSIVE', 'Device mode switcher present');
} else {
  log('FAIL', 'RESPONSIVE', 'Device mode switcher MISSING');
}
if (designCss.includes('@media')) {
  const mediaCount = (designCss.match(/@media/g) || []).length;
  log('PASS', 'RESPONSIVE', `${mediaCount} @media breakpoints found in design-system.css`);
} else {
  log('WARN', 'RESPONSIVE', 'No @media breakpoints in design-system.css');
}

// ═══════════════════════════════════════════
// 7. NAVIGATION & VIEWS CHECK
// ═══════════════════════════════════════════
console.log('\n═══════ 7. NAVIGATION ═══════\n');

const navTabs = (html.match(/data-view="(\w+)"/g) || []).map(m => m.match(/"(\w+)"/)[1]);
navTabs.forEach(t => {
  log('PASS', 'NAV', `Navigation tab "${t}" present`);
});

// Check admin tab nav
const adminTabs = (html.match(/switchAdminSection\('(\w+)'/g) || []).map(m => m.match(/'(\w+)'/)[1]);
adminTabs.forEach(t => {
  log('PASS', 'NAV', `Admin section tab "${t}" configured`);
});

// ═══════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════
console.log('\n═══════════════════════════════════════════');
console.log(`  RESULTS: ${results.passed} passed | ${results.failed} failed | ${results.warnings} warnings`);
console.log('═══════════════════════════════════════════\n');

// Write results to JSON
fs.writeFileSync(
  path.join(PROJECT, 'tests', 'comprehensive-test-results.json'),
  JSON.stringify(results, null, 2),
  'utf8'
);
console.log('Results saved to tests/comprehensive-test-results.json');
