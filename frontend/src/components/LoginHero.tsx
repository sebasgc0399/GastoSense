import { useEffect, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '../config/firebase';
import { RobotAvatar } from './RobotAvatar';

const Loader2 = (props: SVGProps<SVGSVGElement>) => (
  <svg
    {...props}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M21 12a9 9 0 11-18 0" strokeOpacity="0.25" />
    <path d="M21 12a9 9 0 00-3-6" />
  </svg>
);

const ArrowRight = (props: SVGProps<SVGSVGElement>) => (
  <svg
    {...props}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M5 12h14" />
    <path d="M12 5l7 7-7 7" />
  </svg>
);

type BotMood = 'idle' | 'happy' | 'thinking' | 'waving' | 'excited' | 'curious' | 'success';

const idleMessages: { text: string; mood: BotMood }[] = [
  { text: 'Hola! Soy tu asistente financiero', mood: 'waving' },
  { text: 'Te ayudare a entender tus gastos', mood: 'happy' },
  { text: 'Registrar gastos es tan facil como un toque', mood: 'excited' },
  { text: 'Listo para tomar el control de tu dinero?', mood: 'curious' },
];

const loadingStages = [
  { text: 'Conectando con Google...', mood: 'thinking', duration: 1200 },
  { text: 'Verificando tu cuenta...', mood: 'thinking', duration: 900 },
  { text: 'Listo! Preparando todo...', mood: 'happy', duration: 800 },
  { text: 'Bienvenido a GastoSense!', mood: 'success', duration: 900 },
];

export function LoginHero() {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState(idleMessages[0].text);
  const [messageVisible, setMessageVisible] = useState(true);
  const [loadingStage, setLoadingStage] = useState(0);
  const idleIndex = useRef(0);
  const [botBob, setBotBob] = useState(0);

  useEffect(() => {
    if (isLoading) return;
    const interval = setInterval(() => {
      idleIndex.current = (idleIndex.current + 1) % idleMessages.length;
      const next = idleMessages[idleIndex.current];
      swapMessage(next.text);
    }, 3500);
    return () => clearInterval(interval);
  }, [isLoading]);

  useEffect(() => {
    const bobInterval = setInterval(() => {
      setBotBob((prev) => (prev + 1) % 2);
    }, 1800);
    return () => clearInterval(bobInterval);
  }, []);

  const swapMessage = (text: string) => {
    setMessageVisible(false);
    setTimeout(() => {
      setMessage(text);
      setMessageVisible(true);
    }, 200);
  };

  const handleBotHover = (hover: boolean) => {
    if (isLoading) return;
    if (hover) {
      swapMessage('Quieres empezar? Solo un clic!');
    } else {
      swapMessage(idleMessages[0].text);
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setLoadingStage(0);
    try {
      for (let i = 0; i < loadingStages.length; i++) {
        const stage = loadingStages[i];
        swapMessage(stage.text);
        setLoadingStage(i);
        await new Promise((resolve) => setTimeout(resolve, stage.duration));
      }
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error) {
      console.error(error);
      swapMessage('No pudimos iniciar sesion, intenta de nuevo.');
    } finally {
      setIsLoading(false);
    }
  };

  const robotFloat = botBob === 0 ? 'translateY(0px) scale(1)' : 'translateY(-4px) scale(1.02)';

  return (
    // Forzamos tema oscuro local con clase dedicada (sin afectar el tema global del usuario)
    <div className="login-force-dark min-h-screen bg-animated flex items-center justify-center p-4">
      {/* Tarjeta principal */}
      <div className="card mx-auto flex w-full max-w-md flex-col items-center gap-6 p-8 shadow-2xl">
        {/* Robot */}
        <div
          className="cursor-pointer transition-transform duration-500 hover:scale-105"
          onMouseEnter={() => handleBotHover(true)}
          onMouseLeave={() => handleBotHover(false)}
          style={{ transform: robotFloat, transition: 'transform 0.8s ease-in-out' }}
        >
          <RobotAvatar className="h-24 w-24" />
        </div>

        {/* Burbuja de Mensaje */}
        <div
          className={`relative w-full rounded-2xl border border-[var(--card-border)] bg-[var(--card)] px-5 py-3 text-sm font-medium text-[var(--text)] shadow-lg transition-all duration-300 ${
            messageVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
          }`}
        >
          <div className="absolute -top-2 left-1/2 h-4 w-4 -translate-x-1/2 rotate-45 border-l border-t border-[var(--card-border)] bg-[var(--card)]" />
          <p className="text-center leading-relaxed">{message}</p>

          {isLoading && (
            <div className="mt-3 flex justify-center gap-1.5">
              {loadingStages.map((_, idx) => (
                <div
                  key={String(idx)}
                  className={`h-1 rounded-full transition-all duration-300 ${
                    idx <= loadingStage ? 'w-6 bg-[var(--primary)]' : 'w-1.5 bg-[var(--progress-bg)]'
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        <div className="w-full space-y-4 text-center">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide border border-[var(--card-border)] bg-[var(--input-bg)] text-[var(--text)]">
            Bienvenido a GastoSense
          </div>

          <h1 className="text-3xl font-bold leading-tight text-[var(--text)]">
            Controla tus gastos con IA <span className="text-[var(--primary)]">rapido y seguro</span>.
          </h1>

          <p className="text-base text-[var(--text)]">
            Registra en segundos, obten consejos personalizados y manten tus datos protegidos con Google Auth.
          </p>

          <div className="flex flex-col items-center gap-3">
            <button
              onClick={handleGoogleLogin}
              onMouseEnter={() => swapMessage('Presiona para comenzar!')}
              disabled={isLoading}
              className="w-full rounded-xl bg-[var(--primary)] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-[var(--primary)]/30 transition hover:opacity-90 hover:-translate-y-0.5 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Conectando...
                </>
              ) : (
                <>
                  Continuar con Google <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>

            <div className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--input-bg)] px-4 py-3 text-xs text-[var(--text)]">
              Tu clave de IA y tus datos se guardan en Firebase, no en el navegador.
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 text-sm text-[var(--text)]">
            <div className="flex items-center justify-center gap-2">
              <span className="text-[var(--primary)]">•</span> Registro rapido mobile-first
            </div>
            <div className="flex items-center justify-center gap-2">
              <span className="text-[var(--primary)]">•</span> Consejos IA segun tu estilo
            </div>
            <div className="flex items-center justify-center gap-2">
              <span className="text-[var(--primary)]">•</span> Plantillas y recordatorios
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
