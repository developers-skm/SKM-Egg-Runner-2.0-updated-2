/**
 * SKM Push Notification Test Script
 *
 * Run this FIRST to verify your FCM server key works before touching the app.
 *
 * Usage:
 *   node scripts/test-push.mjs <FCM_SERVER_KEY> [device_token]
 *
 * Examples:
 *   # Just verify the server key is valid (sends to a test token)
 *   node scripts/test-push.mjs AAAAyourServerKey...
 *
 *   # Send to a real device token you copied from Firestore
 *   node scripts/test-push.mjs AAAAyourServerKey... fXyz_abc123:APA91b...
 *
 * Get your server key:
 *   Firebase Console → Project Settings → Cloud Messaging
 *   → Cloud Messaging API (Legacy) → Server key
 */

const [,, serverKey, deviceToken] = process.argv;

if (!serverKey) {
  console.error('\n❌  Usage: node scripts/test-push.mjs <FCM_SERVER_KEY> [device_token]\n');
  process.exit(1);
}

console.log('\n🔑  Server key prefix:', serverKey.substring(0, 12) + '...');
console.log('📱  Device token:', deviceToken ? deviceToken.substring(0, 20) + '...' : '(not provided — will test key only)\n');

// ─── Test 1: Validate server key by calling FCM info endpoint ─────────────────
console.log('── Test 1: Validating server key with FCM...');
const validateResp = await fetch('https://iid.googleapis.com/iid/info/PLACEHOLDER_TOKEN?details=true', {
  headers: { Authorization: `key=${serverKey}` },
});
// 400 = invalid token but KEY is good  |  401 = bad key  |  403 = wrong project
if (validateResp.status === 401) {
  console.error('❌  Server key is INVALID (401 Unauthorized). Double-check you copied the full key.');
  process.exit(1);
} else if (validateResp.status === 403) {
  console.error('❌  Server key is for a different project (403). Make sure you used the key from project skm-egg-runner.');
  process.exit(1);
} else {
  console.log('✅  Server key accepted by FCM.');
}

// ─── Test 2: Send a real push if a device token was provided ─────────────────
if (deviceToken) {
  console.log('\n── Test 2: Sending real push notification to device...');

  const payload = {
    to: deviceToken,
    priority: 'high',
    notification: {
      title: '🟢 SKM Push Test',
      body:  `Push works! Sent at ${new Date().toLocaleTimeString()}`,
      sound: 'default',
    },
    data: {
      type:        'admin_announcement',
      clickAction: 'https://skm-egg-runner.web.app/',
    },
  };

  const sendResp = await fetch('https://fcm.googleapis.com/fcm/send', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `key=${serverKey}`,
    },
    body: JSON.stringify(payload),
  });

  const result = await sendResp.json();
  console.log('FCM response:', JSON.stringify(result, null, 2));

  if (result.success === 1) {
    console.log('\n✅  Push delivered successfully! Check the device.');
  } else if (result.failure === 1) {
    const err = result.results?.[0]?.error ?? 'Unknown';
    console.error(`\n❌  Push failed: ${err}`);
    if (err === 'NotRegistered') {
      console.error('   → This token is expired/invalid. User must reopen the app to get a fresh token.');
    } else if (err === 'InvalidRegistration') {
      console.error('   → Token format is wrong. Make sure you copied the full FCM token from Firestore.');
    }
  }
} else {
  console.log('\n── Test 2 skipped (no device token provided).');
  console.log('   To send a real push, get a token from:');
  console.log('   Firebase Console → Firestore → users/{uid} → fcmToken field');
  console.log('   Then re-run: node scripts/test-push.mjs <SERVER_KEY> <DEVICE_TOKEN>');
}

console.log('\n── Summary ──────────────────────────────────────────────────────');
console.log('Server key: ✅ Valid');
console.log('Next steps:');
console.log('  1. Add to .env:  VITE_FCM_SERVER_KEY=', serverKey.substring(0, 12) + '...');
console.log('  2. Add to .env:  VITE_FIREBASE_VAPID_KEY=<your VAPID public key>');
console.log('     Get VAPID:   Firebase Console → Project Settings → Cloud Messaging → Web Push certificates');
console.log('  3. Restart dev server: npm run dev');
console.log('  4. Open app on phone → permission prompt appears → allow');
console.log('  5. Type in NOTIFY tab: notify: Hello everyone');
console.log('─────────────────────────────────────────────────────────────────\n');
