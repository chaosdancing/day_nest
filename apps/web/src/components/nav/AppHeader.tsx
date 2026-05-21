import { NavLink, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { useThemeStore } from '@/lib/theme';
import { cn } from '@/lib/cn';
import { displayInitial } from '@/lib/displayInitial';

const navItems = [
  { to: '/', label: '时间轴', end: true },
  { to: '/favorites', label: '最爱' },
  { to: '/tags', label: '标签' },
  { to: '/upload', label: '上传' },
];

export function AppHeader() {
  const { user, logout } = useAuth();
  const mode = useThemeStore((s) => s.mode);
  const toggle = useThemeStore((s) => s.toggle);
  return (
    <header
      className={cn(
        'sticky top-0 z-30 border-b backdrop-blur-md',
        'bg-paper/85 border-kraft/20',
        'dark:bg-ink-deep/85 dark:border-paper/10'
      )}
    >
      <div className="max-w-5xl mx-auto flex items-center px-2.5 sm:px-6 h-14 gap-1.5 sm:gap-3">
        <Link
          to="/"
          className="font-hand text-xl sm:text-2xl leading-none text-kraft-dark dark:text-kraft-light shrink-0"
        >
          DayNest
        </Link>
        <nav className="flex flex-1 min-w-0 gap-0.5 sm:gap-1 overflow-x-auto text-xs sm:text-sm scrollbar-none">
          {navItems.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.end}
              className={({ isActive }) =>
                cn(
                  'shrink-0 rounded-md px-2 sm:px-2.5 py-1 transition-colors',
                  isActive
                    ? 'bg-kraft/20 text-ink dark:bg-paper/15 dark:text-paper'
                    : 'text-ink/70 hover:text-ink dark:text-paper/65 dark:hover:text-paper'
                )
              }
            >
              {it.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm shrink-0">
          <button
            type="button"
            onClick={toggle}
            aria-label={mode === 'dark' ? '切换到亮色' : '切换到暗色'}
            className={cn(
              'relative grid h-8 w-8 sm:h-9 sm:w-9 place-items-center rounded-full border transition',
              'border-kraft/30 bg-paper/70 text-kraft-dark hover:bg-paper',
              'dark:border-paper/25 dark:bg-paper/10 dark:text-paper/85 dark:hover:bg-paper/20'
            )}
          >
            <AnimatePresence initial={false} mode="popLayout">
              {mode === 'dark' ? (
                <motion.span
                  key="moon"
                  initial={{ rotate: -90, opacity: 0, scale: 0.6 }}
                  animate={{ rotate: 0, opacity: 1, scale: 1 }}
                  exit={{ rotate: 90, opacity: 0, scale: 0.6 }}
                  transition={{ duration: 0.25 }}
                  className="text-base"
                  aria-hidden
                >
                  🌙
                </motion.span>
              ) : (
                <motion.span
                  key="sun"
                  initial={{ rotate: 90, opacity: 0, scale: 0.6 }}
                  animate={{ rotate: 0, opacity: 1, scale: 1 }}
                  exit={{ rotate: -90, opacity: 0, scale: 0.6 }}
                  transition={{ duration: 0.25 }}
                  className="text-base"
                  aria-hidden
                >
                  ☀️
                </motion.span>
              )}
            </AnimatePresence>
          </button>
          {user ? (
            <>
              {/* Desktop: greet by name, link to settings */}
              <Link
                to="/settings"
                className="hidden sm:inline truncate max-w-[7rem] text-ink/70 hover:text-ink dark:text-paper/70 dark:hover:text-paper"
              >
                {user.displayName}
              </Link>
              {/* Mobile: compact circular initial — same target. We
                  use `displayInitial` (grapheme-aware via Intl.Segmenter)
                  so emoji and ZWJ-joined display names like "🦊 妈" or
                  "👨‍👩‍👧" render as a single intact glyph instead of a
                  broken surrogate half. */}
              <Link
                to="/settings"
                aria-label="设置"
                className={cn(
                  'sm:hidden grid h-8 w-8 place-items-center rounded-full border text-sm font-mono tracking-wide transition',
                  'border-kraft/30 bg-paper/70 text-kraft-dark hover:bg-paper',
                  'dark:border-paper/25 dark:bg-paper/10 dark:text-paper/85 dark:hover:bg-paper/20'
                )}
              >
                <span aria-hidden>{displayInitial(user.displayName, user.username)}</span>
              </Link>
              <button
                onClick={logout}
                className="text-ink/60 hover:text-ink underline-offset-4 hover:underline dark:text-paper/60 dark:hover:text-paper"
              >
                登出
              </button>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}
