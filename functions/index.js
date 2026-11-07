const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

/**
 * Callable function for drivers to accept a trip.
 * Uses a Realtime Database transaction to ensure atomic assignment.
 * Only authenticated drivers can call this function.
 */
exports.acceptTrip = functions.https.onCall(async (data, context) => {
  // Authentication check
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'You must be logged in to accept a trip.'
    );
  }

  const driverId = context.auth.uid;
  const tripId = data.tripId;

  if (!tripId) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'tripId is required.'
    );
  }

  const db = admin.database();
  const tripRef = db.ref(`trips/${tripId}`);

  return new Promise((resolve, reject) => {
    tripRef.transaction(current => {
      // Abort if trip does not exist
      if (!current) return null;

      // Ensure trip is in a state that can be accepted
      const allowedStatuses = ['searching', 'requested', 'pending'];
      if (current.status && !allowedStatuses.includes(current.status)) {
        return; // abort transaction
      }

      // If already assigned to another driver, abort
      if (current.driverId && current.driverId !== driverId) {
        return; // abort transaction
      }

      // Assign driver and update status
      current.driverId = driverId;
      current.status = 'accepted';

      // Record status timeline entry
      if (!current.statusTimeline) current.statusTimeline = {};
      const logId = Date.now().toString();
      current.statusTimeline[logId] = {
        status: 'accepted',
        driverId: driverId,
        timestamp: admin.database.ServerValue.TIMESTAMP
      };

      return current;
    }, (error, committed, snapshot) => {
      if (error) {
        reject(new functions.https.HttpsError('internal', error.message));
      } else if (!committed) {
        reject(new functions.https.HttpsError(
          'failed-precondition',
          'Trip already assigned or not in an accept‑able state.'
        ));
      } else {
        resolve({ success: true, tripId });
      }
    });
  });
});
