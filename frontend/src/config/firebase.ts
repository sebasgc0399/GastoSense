import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

function resolveAuthDomain() {
  const envAuthDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN;

  if (typeof window === 'undefined') return envAuthDomain;

  const hostname = window.location.hostname;
  const isLocalhost =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname.endsWith('.local') ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);

  return isLocalhost ? envAuthDomain : hostname;
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  // En iOS Safari con storage partitioning, usar un authDomain distinto al hostname puede romper popup/redirect.
  authDomain: resolveAuthDomain(),
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const missingKeys = Object.entries(firebaseConfig)
  .filter(([, value]) => typeof value !== 'string' || value.trim() === '')
  .map(([key]) => key);

let firebaseInitError: Error | null = null;
let firebaseApp: FirebaseApp | null = null;
let db: Firestore | null = null;
let auth: Auth | null = null;

if (missingKeys.length) {
  firebaseInitError = new Error(
    `Faltan variables de entorno para Firebase: ${missingKeys.join(', ')}. Agrega las VITE_FIREBASE_* en el entorno de build.`,
  );
  console.error(firebaseInitError);
} else {
  try {
    firebaseApp = initializeApp(firebaseConfig);
    db = getFirestore(firebaseApp);
    auth = getAuth(firebaseApp);
  } catch (error) {
    firebaseInitError =
      error instanceof Error
        ? error
        : new Error('No se pudo inicializar Firebase. Revisa la API key y dominios autorizados.');
    console.error('Fallo al inicializar Firebase', error);
  }
}

function ensureFirebaseReady() {
  if (firebaseInitError) {
    throw firebaseInitError;
  }
  if (!firebaseApp || !db || !auth) {
    throw new Error('Firebase no está inicializado.');
  }
}

export function getFirebaseApp(): FirebaseApp {
  ensureFirebaseReady();
  return firebaseApp!;
}

export function getFirestoreDb(): Firestore {
  ensureFirebaseReady();
  return db!;
}

export function getFirebaseAuth(): Auth {
  ensureFirebaseReady();
  return auth!;
}

export { firebaseInitError };
