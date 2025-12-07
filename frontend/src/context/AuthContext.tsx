/* eslint-disable react-refresh/only-export-components */
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { auth } from '../config/firebase';

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

  useEffect(() => {
    // Aseguramos persistencia basada en storage/cookies (no por pestaña) para evitar sesiones "fantasma".
    setPersistence(auth, browserLocalPersistence).catch((err) => {
      console.error('No se pudo configurar la persistencia de auth:', err);
    });

    const unsubscribe = onAuthStateChanged(auth, (current) => {
      setUser(current);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const logout = async () => {
    await signOut(auth);
    // Limpieza defensiva de caché de Firebase Auth en storage/cookies.
    Object.keys(localStorage)
      .filter((k) => k.startsWith('firebase:authUser') || k.startsWith('firebase:authDomain'))
      .forEach((k) => localStorage.removeItem(k));
    Object.keys(sessionStorage)
      .filter((k) => k.startsWith('firebase:authUser') || k.startsWith('firebase:authDomain'))
      .forEach((k) => sessionStorage.removeItem(k));
  };

  const value = useMemo(
    () => ({
      user,
      loading,
      signInWithGoogle,
      logout,
    }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
