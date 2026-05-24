import { useState, type FormEvent } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import type { AuthResponse } from '@daynest/shared';
import { HandwrittenText } from '@/components/scrapbook/HandwrittenText';

export function LoginPage() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const existingToken = useAuthStore((s) => s.accessToken);
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (existingToken) return <Navigate to="/" replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.post<AuthResponse>('/auth/login', {
        username,
        password,
      });
      setAuth(res.data.user, res.data.accessToken);
      navigate('/', { replace: true });
    } catch (err) {
      setError(
        (err as { response?: { data?: { message?: string } } }).response?.data
          ?.message ?? '登录失败'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-paper dark:bg-ink-deep">
      <SoftGradientBackground />
      <PaperGrain />

      <main className="relative z-10 mx-auto flex min-h-screen max-w-5xl items-center justify-center px-4 py-10 sm:py-16">
        <div className="grid w-full gap-6 sm:gap-8 md:grid-cols-[1.05fr_0.95fr] md:gap-16 md:items-center">
          <BrandingSide />
          <FormSide
            username={username}
            password={password}
            error={error}
            loading={loading}
            onUsername={setUsername}
            onPassword={setPassword}
            onSubmit={onSubmit}
          />
        </div>
      </main>
    </div>
  );
}

/* ─────────────────────────── Branding side ─────────────────────────── */

function BrandingSide() {
  return (
    <section className="relative flex flex-col items-center text-center md:items-start md:text-left">
      {/* Polaroid stack is decorative and a bit tall — keep it off the
          critical path on phones so the login form sits within thumb
          reach instead of getting pushed below the fold. Tablet and up
          have the screen real estate to enjoy it. */}
      <div className="hidden md:block">
        <PolaroidStack />
      </div>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.55, ease: 'easeOut' }}
        className="md:mt-12"
      >
        <p className="font-mono text-[11px] tracking-[0.4em] text-kraft-dark/70 dark:text-paper/55">
          DAYNEST · 慢慢记
        </p>
        <HandwrittenText
          as="h1"
          className="mt-2 block text-4xl leading-tight text-ink dark:text-paper sm:text-5xl md:mt-3 md:text-6xl"
        >
          收纳烟火日常
          <br />
          酿造专属回忆
        </HandwrittenText>
        {/* Long-form subtitle is only worth the vertical cost on
            tablet+ where it lives next to the form. On phones it just
            crowds the login. */}
        <p className="mt-4 hidden max-w-sm text-sm leading-relaxed text-ink/65 dark:text-paper/70 md:block">
          孩子的金句、出游的午后、深夜的厨房——一张张留下来，攒成一本只属于家的相册。
        </p>
      </motion.div>
    </section>
  );
}

/**
 * Three rotated polaroid cards fanned out as a desktop hero. Each card
 * shows an abstract two-band "photo composition" (sky + ground) so the
 * stack reads like a triptych of real snapshots rather than a row of
 * empty placeholders. The top card adds a hand-written date stamp,
 * picked up dynamically so the polaroid feels freshly developed for
 * whoever's logging in today.
 *
 * Visual intent:
 *   - bottom card  : warm yellow + kraft (golden hour)
 *   - middle card  : sky blue + soft green (outdoors)
 *   - top card     : sepia paper + kraft, dated, with a tiny ♡ accent
 *
 * Hover gently tilts the whole stack; a strip of washi tape pins the
 * top card.
 */
function PolaroidStack() {
  const cards = [
    {
      rotate: -10,
      x: -28,
      y: 10,
      sky: 'bg-pin-yellow/55',
      ground: 'bg-kraft-light/55',
    },
    {
      rotate: 6,
      x: 14,
      y: -4,
      sky: 'bg-pin-blue/40',
      ground: 'bg-pin-green/35',
    },
    {
      rotate: -2,
      x: 0,
      y: 0,
      sky: 'bg-paper-dark/65',
      ground: 'bg-kraft/45',
    },
  ] as const;

  const today = new Date();
  const dateStamp = `${today.getFullYear()}·${String(today.getMonth() + 1).padStart(2, '0')}·${String(today.getDate()).padStart(2, '0')}`;

  return (
    <motion.div
      className="relative h-44 w-44 sm:h-52 sm:w-52"
      whileHover={{ rotate: 2 }}
      transition={{ type: 'spring', stiffness: 140, damping: 16 }}
    >
      {cards.map((c, i) => {
        const isTop = i === cards.length - 1;
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 36, rotate: c.rotate - 8 }}
            animate={{
              opacity: 1,
              y: c.y,
              x: c.x,
              rotate: c.rotate,
            }}
            transition={{
              delay: 0.08 * i,
              type: 'spring',
              stiffness: 110,
              damping: 14,
            }}
            className="absolute inset-0"
            style={{ zIndex: i }}
          >
            <div className="relative h-full w-full rounded-sm bg-paper p-2.5 shadow-polaroid dark:bg-paper/95">
              {/* Abstract "photograph": stacked sky + ground bands.
                  The exact proportions hint at a horizon line and give
                  the card weight without committing to any imagery. */}
              <div className="relative h-[78%] w-full overflow-hidden rounded-[2px]">
                <div className={`h-[58%] w-full ${c.sky}`} />
                <div className={`h-[42%] w-full ${c.ground}`} />
                {isTop ? (
                  <span
                    aria-hidden
                    className="absolute right-2 top-1.5 font-serif text-base text-pin-red/85"
                  >
                    ♡
                  </span>
                ) : null}
              </div>
              {/* Polaroid caption strip. Top card stamps today's date;
                  back cards just show a faint placeholder slug. */}
              <div className="mt-1.5 flex h-2.5 items-center justify-end pr-1">
                {isTop ? (
                  <span className="font-mono text-[9px] tracking-wider text-ink/55">
                    {dateStamp}
                  </span>
                ) : (
                  <span className="h-1 w-1/2 rounded-full bg-ink/10 dark:bg-ink/25" />
                )}
              </div>
            </div>
          </motion.div>
        );
      })}

      {/* Washi tape pinning the top card */}
      <motion.span
        aria-hidden
        initial={{ opacity: 0, scale: 0.6, rotate: -20 }}
        animate={{ opacity: 1, scale: 1, rotate: -16 }}
        transition={{ delay: 0.5, duration: 0.4 }}
        className="absolute -top-3 left-1/2 z-10 h-3.5 w-12 -translate-x-1/2 rounded-[2px] bg-pin-red/80 shadow-sm"
      />
    </motion.div>
  );
}

/* ─────────────────────────── Form side ─────────────────────────── */

function FormSide({
  username,
  password,
  error,
  loading,
  onUsername,
  onPassword,
  onSubmit,
}: {
  username: string;
  password: string;
  error: string | null;
  loading: boolean;
  onUsername: (v: string) => void;
  onPassword: (v: string) => void;
  onSubmit: (e: FormEvent) => void;
}) {
  return (
    <motion.form
      onSubmit={onSubmit}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="relative w-full max-w-sm justify-self-center rounded-3xl border border-kraft/15 bg-paper/85 p-7 shadow-[0_20px_60px_-25px_rgba(0,0,0,0.35)] backdrop-blur-lg sm:p-8 dark:border-paper/10 dark:bg-ink-deep/80 dark:shadow-[0_20px_60px_-25px_rgba(0,0,0,0.7)]"
    >
      <header className="mb-6 text-center">
        <h2 className="font-serif text-2xl tracking-tight text-ink dark:text-paper">
          欢迎回家
        </h2>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.35em] text-ink/45 dark:text-paper/50">
          Login
        </p>
      </header>

      <div className="space-y-4">
        <Field
          id="login-username"
          icon="👤"
          label="登录名"
          autoComplete="username"
          value={username}
          onChange={onUsername}
        />
        <Field
          id="login-password"
          icon="🔒"
          label="密码"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={onPassword}
        />
      </div>

      {error ? (
        <motion.p
          initial={{ opacity: 0, y: -2 }}
          animate={{ opacity: 1, y: 0 }}
          role="alert"
          className="mt-4 rounded-md bg-pin-red/10 px-3 py-2 text-xs text-pin-red dark:bg-pin-red/15"
        >
          {error}
        </motion.p>
      ) : null}

      <motion.button
        type="submit"
        disabled={loading || !username || !password}
        whileTap={{ scale: 0.985 }}
        className="group relative mt-6 w-full overflow-hidden rounded-full bg-gradient-to-r from-kraft to-kraft-dark py-2.5 text-sm font-medium text-paper shadow-md transition disabled:cursor-not-allowed disabled:opacity-50 dark:from-kraft-light dark:to-kraft dark:text-ink"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 -left-12 w-12 -skew-x-12 bg-paper/30 opacity-0 transition group-hover:translate-x-[calc(100%+3rem)] group-hover:opacity-100"
        />
        <span className="relative inline-flex items-center justify-center gap-2">
          {loading ? (
            <>
              <Spinner /> 正在推门
            </>
          ) : (
            <>🚪 推门进去</>
          )}
        </span>
      </motion.button>

      <p className="mt-5 text-center font-mono text-[10px] uppercase tracking-[0.3em] text-ink/40 dark:text-paper/45">
        Private · For family only
      </p>
    </motion.form>
  );
}

function Field({
  id,
  icon,
  label,
  type = 'text',
  autoComplete,
  value,
  onChange,
}: {
  id: string;
  icon: string;
  label: string;
  type?: string;
  autoComplete?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label htmlFor={id} className="group block">
      <span className="mb-1.5 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.3em] text-ink/55 dark:text-paper/60">
        <span aria-hidden>{icon}</span>
        {label}
      </span>
      <div className="relative">
        <input
          id={id}
          type={type}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          className="peer w-full rounded-lg border border-kraft/25 bg-paper/70 px-3.5 py-2 text-base text-ink outline-none transition focus:border-kraft focus:bg-paper focus:ring-2 focus:ring-kraft/20 dark:border-paper/15 dark:bg-paper/5 dark:text-paper dark:focus:border-paper/50 dark:focus:bg-paper/10 dark:focus:ring-paper/15"
        />
        {/* Inline focus accent — a tiny tape strip that animates in. */}
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-px left-3 right-3 h-px origin-left scale-x-0 bg-gradient-to-r from-kraft via-kraft-dark to-kraft transition-transform duration-200 peer-focus:scale-x-100 dark:from-paper/60 dark:via-paper/40 dark:to-paper/60"
        />
      </div>
    </label>
  );
}

function Spinner() {
  return (
    <motion.span
      aria-hidden
      className="inline-block h-3 w-3 rounded-full border-2 border-paper/30 border-t-paper"
      animate={{ rotate: 360 }}
      transition={{ duration: 0.85, repeat: Infinity, ease: 'linear' }}
    />
  );
}

/* ─────────────────────────── Background layers ─────────────────────────── */

function SoftGradientBackground() {
  return (
    <>
      {/* Warm radial wash from the top-left, plus a subtle pin-color
          accent in the bottom-right. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(60% 50% at 15% 10%, rgba(214, 184, 130, 0.35), transparent 70%), radial-gradient(40% 40% at 85% 90%, rgba(178, 92, 92, 0.18), transparent 70%)',
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 dark:opacity-100 opacity-0"
        style={{
          background:
            'radial-gradient(60% 50% at 15% 10%, rgba(214, 184, 130, 0.18), transparent 70%), radial-gradient(40% 40% at 85% 90%, rgba(178, 92, 92, 0.20), transparent 70%)',
        }}
      />
    </>
  );
}

function PaperGrain() {
  // Cheap CSS-only paper grain: two layered low-opacity SVG noise dots.
  // Keeps the page from feeling like flat plastic without shipping an
  // image asset.
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 opacity-[0.07] dark:opacity-[0.05] mix-blend-multiply dark:mix-blend-screen"
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='120' height='120' filter='url(%23n)' opacity='0.7'/></svg>\")",
        backgroundSize: '120px 120px',
      }}
    />
  );
}
