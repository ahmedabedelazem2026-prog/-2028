import fs from 'fs';
const app = fs.readFileSync('js/app.js', 'utf8');

const missing = [
  "totalFareDisplay",
  "routeDistanceDisplay",
  "routeDurationDisplay",
  "surgeBadgeDisplay",
  "customerSearchingOverlay",
  "customerActiveTripCard",
  "custActiveDriverName",
  "custActiveDriverPhone",
  "custActiveDriverPhoneLink",
  "custActiveCarModel",
  "custActiveCarPlate",
  "custActivePinDisplay",
  "custActiveStatusText",
  "custActiveTripPrice",
  "custActiveLiveTrackingNote",
  "btnCustSos",
  "scheduleRideModal",
  "schedDate",
  "schedTime",
  "surgeZonesBanner",
  "complaintModal",
  "phoneVerifyModal",
  "btnDriverMarkArrived",
  "btnDriverStartTrip",
  "btnDriverCompleteTrip",
  "incomingTripFrom",
  "incomingTripTo",
  "incomingTripFare",
  "incomingTripDistance",
  "chatPeerName",
  "chatMessagesContainer",
  "btnSendChatMessage",
  "chatTextInput",
  "ratingDriverName",
  "ratingTagsContainer",
  "btnSubmitRating",
  "ratingCommentText",
  "walletBalanceDisplay",
  "navWalletBalance",
  "topupModal"
];

for (const id of missing) {
  const lines = app.split('\n');
  const found = [];
  lines.forEach((l, idx) => {
    if (l.includes(id)) {
      found.push(idx + 1);
    }
  });
  console.log(`${id}: lines [${found.join(', ')}]`);
}
