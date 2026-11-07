import fs from 'fs';

const app = fs.readFileSync('js/app.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

const missing = [
  "surgeBadgeDisplay",
  "customerSearchingOverlay",
  "customerActiveTripCard",
  "custActiveDriverPhoneLink",
  "custActiveLiveTrackingNote",
  "btnCustSos",
  "scheduleRideModal",
  "schedDate",
  "schedTime",
  "schedNotes",
  "surgeZonesBanner",
  "complaintModal",
  "phoneVerifyModal",
  "btnDriverMarkArrived",
  "btnDriverStartTrip",
  "btnDriverCompleteTrip",
  "chatTextInput",
  "chatMessagesContainer",
  "ratingTagsContainer",
  "ratingCommentText",
  "walletBalanceDisplay",
  "navWalletBalance",
  "topupModal"
];

for (const id of missing) {
  const inHtml = html.includes(`id="${id}"`) || html.includes(`id='${id}'`);
  // Look for lines in app.js
  const lines = app.split('\n').filter(l => l.includes(id));
  console.log(`ID: ${id} | In HTML: ${inHtml} | App usages: ${lines.length}`);
  lines.forEach(l => console.log('   ' + l.trim()));
}
