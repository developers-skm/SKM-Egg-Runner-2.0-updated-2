/**
 * SKM EGG RUNNER — Mobile OTP Auth Service
 * Frontend-ready UI flow. Real OTP backend is NOT connected yet.
 * All functions return mock success responses for UI wiring.
 *
 * TODO: Connect real OTP provider (e.g. Firebase Phone Auth, Twilio, MSG91)
 *       Replace mockSendOtp / mockVerifyOtp with real API calls.
 *       The function signatures and return shapes must remain unchanged
 *       so the UI can be swapped without redesign.
 */

export interface OtpResult {
  success: boolean;
  error?: string;
  /** Verification token returned by real backend — opaque to the UI. */
  verificationId?: string;
}

export interface OtpVerifyResult {
  success: boolean;
  error?: string;
  uid?: string;
}

// ─────────────────────────────────────────────
// sendOtp — sends a 6-digit OTP to the given number
// ─────────────────────────────────────────────

export async function sendOtp(phoneNumber: string): Promise<OtpResult> {
  if (!phoneNumber || phoneNumber.trim().length < 7) {
    return { success: false, error: 'Please enter a valid mobile number.' };
  }

  // TODO: Replace with real backend call, e.g.:
  //   const result = await signInWithPhoneNumber(auth, phoneNumber, recaptchaVerifier);
  //   return { success: true, verificationId: result.verificationId };

  // Mock: simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 900));

  return {
    success: true,
    verificationId: 'MOCK_VERIFICATION_ID_' + Date.now(),
  };
}

// ─────────────────────────────────────────────
// verifyOtp — verifies the code the user typed
// ─────────────────────────────────────────────

export async function verifyOtp(
  verificationId: string,
  otp: string
): Promise<OtpVerifyResult> {
  if (!otp || otp.trim().length !== 6) {
    return { success: false, error: 'Please enter the 6-digit code.' };
  }
  if (!verificationId) {
    return { success: false, error: 'Session expired. Please resend the OTP.' };
  }

  // TODO: Replace with real backend call, e.g.:
  //   const credential = PhoneAuthProvider.credential(verificationId, otp);
  //   const userCredential = await signInWithCredential(auth, credential);
  //   return { success: true, uid: userCredential.user.uid };

  // Mock: any 6-digit code is accepted
  await new Promise((resolve) => setTimeout(resolve, 800));

  return {
    success: true,
    uid: 'MOCK_PHONE_UID_' + Date.now(),
  };
}
