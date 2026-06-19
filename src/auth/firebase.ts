/**
 * SKM EGG RUNNER — Auth module Firebase re-export
 * Provides a local alias so auth files can import Firebase
 * from within the src/auth/ folder without relative path gymnastics.
 */
export { auth, db } from '../services/firebase/firebase';
export { default as firebaseApp } from '../services/firebase/firebase';
