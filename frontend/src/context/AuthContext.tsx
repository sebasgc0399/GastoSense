/* eslint-disable react-refresh/only-export-components */
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  type User,
} from 'firebase/auth';
import { createContext, useContext, useEffect, useState } from 'react';
import { getFirebaseAuth, firebaseInitError } from '../config/firebase';
import { isIOSSafari } from '../utils/isIOSSafari';

interface AuthContextState {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [initError, setInitError] = useState<Error | null>(firebaseInitError);

  useEffect(() => {
    if (initError) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    let unsubscribe: (() => void) | undefined;

    const initializeAuth = async () => {
      let auth: ReturnType<typeof getFirebaseAuth>;

      try {
        auth = getFirebaseAuth();
      } catch (error) {
        if (!isMounted) return;
        setInitError(error instanceof Error ? error : new Error('No se pudo iniciar Firebase Auth.'));
        setLoading(false);
        return;
      }

      try {
        // Aseguramos persistencia basada en storage/cookies (no por pestaña) para evitar sesiones "fantasma".
        await setPersistence(auth, browserLocalPersistence);
        const redirectResult = await getRedirectResult(auth);
        if (redirectResult?.user && isMounted) {
          setUser(redirectResult.user);
        }
      } catch (err) {
        console.error('No se pudo completar el flujo de redirect:', err);
      } finally {
        unsubscribe = onAuthStateChanged(auth, (current) => {
          if (!isMounted) return;
          setUser(current);
          setLoading(false);
        });
      }
    };

    void initializeAuth();

    return () => {
      isMounted = false;
      if (unsubscribe) unsubscribe();
    };
  }, [initError]);

  const signInWithGoogle = async () => {
    if (initError) throw initError;
    const auth = getFirebaseAuth();
    const provider = new GoogleAuthProvider();
    if (isIOSSafari()) {
      await signInWithRedirect(auth, provider);
      return;
    }
    await signInWithPopup(auth, provider);
  };

  const logout = async () => {
    if (initError) throw initError;
    const auth = getFirebaseAuth();
    await signOut(auth);
    // Limpieza defensiva de caché de Firebase Auth en storage/cookies.
    Object.keys(localStorage)
      .filter((k) => k.startsWith('firebase:authUser') || k.startsWith('firebase:authDomain'))
      .forEach((k) => localStorage.removeItem(k));
    Object.keys(sessionStorage)
      .filter((k) => k.startsWith('firebase:authUser') || k.startsWith('firebase:authDomain'))
      .forEach((k) => sessionStorage.removeItem(k));
  };

  if (initError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 p-6 text-center text-white">
        <div className="max-w-md rounded-xl bg-slate-800 p-6 shadow-xl">
          <p className="text-lg font-semibold">No se pudo inicializar Firebase Auth.</p>
          <p className="mt-2 text-sm text-slate-200">
            Verifica que las variables <code className="font-mono">VITE_FIREBASE_*</code> estén configuradas en el entorno de
            build y que la API Key sea válida para este dominio.
          </p>
          <p className="mt-3 text-xs text-slate-300">Error: {initError.message}</p>
        </div>
      </div>
    );
  }

  const value = { user, loading, signInWithGoogle, logout };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
