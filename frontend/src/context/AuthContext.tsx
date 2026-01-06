/* eslint-disable react-refresh/only-export-components */
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  inMemoryPersistence,
  indexedDBLocalPersistence,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  type User,
} from 'firebase/auth';
import { createContext, useContext, useEffect, useState } from 'react';
import { getFirebaseAuth, firebaseInitError } from '../config/firebase';
import { isIOSSafari } from '../utils/isIOSSafari';

type AuthErrorLike = { code?: string; message?: string };

const AUTH_REDIRECT_FLAG_KEY = 'gastosense:authRedirectStartedAt';

function getAuthErrorMessage(error: unknown) {
  const authError = typeof error === 'object' && error !== null ? (error as AuthErrorLike) : undefined;
  const code = authError?.code;
  const message = authError?.message?.toLowerCase();

  if (code === 'auth/popup-blocked') {
    return 'El navegador bloqueó la ventana de Google. Habilita popups o intenta con otro navegador.';
  }
  if (code === 'auth/popup-closed-by-user') {
    return 'Cerraste el login de Google antes de finalizar. Intenta de nuevo.';
  }
  if (code === 'auth/unauthorized-domain') {
    return 'Este dominio no está autorizado para Firebase Auth. Agrega los dominios de Hosting en Firebase Console → Authentication → Settings → Authorized domains.';
  }
  if (code === 'auth/network-request-failed') {
    return 'No pudimos conectar con Firebase. Revisa tu conexión e intenta de nuevo.';
  }
  if (code === 'auth/missing-initial-state' || message?.includes('missing initial state')) {
    return 'Parece que el login se abrió en otra pestaña o navegador. Intenta de nuevo desde el mismo navegador.';
  }

  return 'No pudimos iniciar sesión, intenta de nuevo.';
}

interface AuthContextState {
  user: User | null;
  loading: boolean;
  loginHint: string | null;
  clearLoginHint: () => void;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextState | undefined>(undefined);

let redirectResultProcessed = false;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [initError, setInitError] = useState<Error | null>(firebaseInitError);
  const [loginHint, setLoginHint] = useState<string | null>(null);

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
        // Intentamos persistencia robusta para sobrevivir reloads del redirect (iOS Safari puede ser estricto).
        const persistenceOptions = [
          indexedDBLocalPersistence,
          browserLocalPersistence,
          browserSessionPersistence,
          inMemoryPersistence,
        ] as const;
        for (const persistence of persistenceOptions) {
          try {
            await setPersistence(auth, persistence);
            break;
          } catch (persistenceError) {
            console.warn('No se pudo configurar persistencia de auth:', persistenceError);
          }
        }

        // Solo una vez: procesamos el resultado del redirect antes de suscribir onAuthStateChanged.
        let sawRedirectAttempt = false;
        try {
          sawRedirectAttempt = !!localStorage.getItem(AUTH_REDIRECT_FLAG_KEY);
        } catch {
          // ignore storage failures
        }

        let redirectUser: User | null = null;
        if (!redirectResultProcessed) {
          redirectResultProcessed = true;
          const redirectResult = await getRedirectResult(auth);
          redirectUser = redirectResult?.user ?? null;
          if (redirectUser && isMounted) setUser(redirectUser);
        }

        if (sawRedirectAttempt) {
          try {
            localStorage.removeItem(AUTH_REDIRECT_FLAG_KEY);
          } catch {
            // ignore
          }
          if (!redirectUser && !auth.currentUser && isMounted) {
            setLoginHint(
              'Safari no pudo completar el login con Google. Intenta nuevamente en la misma pestaña; si estás en modo privado, desactívalo.',
            );
          }
        }
      } catch (err) {
        console.error('No se pudo completar el flujo de redirect:', err);
        if (isMounted) setLoginHint(getAuthErrorMessage(err));
      } finally {
        unsubscribe = onAuthStateChanged(auth, (current) => {
          if (!isMounted) return;
          // En algunos casos (iOS Safari) el redirect completa pero la primera notificación llega como null.
          if (!current && auth.currentUser) {
            setUser(auth.currentUser);
          } else {
            setUser(current);
          }
          if (current) setLoginHint(null);
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
    provider.setCustomParameters({ prompt: 'select_account' });
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
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-6 text-center text-[var(--text)]">
        <div className="max-w-md rounded-xl surface-strong p-6 shadow-xl">
          <p className="text-lg font-semibold">No se pudo inicializar Firebase Auth.</p>
          <p className="mt-2 text-sm text-[var(--text)]">
            Verifica que las variables <code className="font-mono">VITE_FIREBASE_*</code> estén configuradas en el entorno de
            build y que la API Key sea válida para este dominio.
          </p>
          <p className="mt-3 text-xs text-[var(--text-muted)]">Error: {initError.message}</p>
        </div>
      </div>
    );
  }

  const clearLoginHint = () => setLoginHint(null);
  const value = { user, loading, loginHint, clearLoginHint, signInWithGoogle, logout };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
