import { NavLink, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/cn';

const navItems = [
  { to: '/', label: '时间轴', end: true },
  { to: '/tags', label: '标签' },
  { to: '/upload', label: '上传' },
];

export function AppHeader() {
  const { user, logout } = useAuth();
  return (
    <header className="sticky top-0 z-20 backdrop-blur-md bg-paper/80 border-b border-kraft/20">
      <div className="max-w-5xl mx-auto flex items-center px-4 sm:px-6 h-14">
        <Link to="/" className="font-hand text-2xl text-kraft-dark mr-6 leading-none">
          DayNest
        </Link>
        <nav className="flex gap-4 text-sm">
          {navItems.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.end}
              className={({ isActive }) =>
                cn(
                  'px-2 py-1 rounded-md transition-colors',
                  isActive ? 'bg-kraft/20 text-ink' : 'text-ink/70 hover:text-ink'
                )
              }
            >
              {it.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 text-sm">
          {user ? (
            <>
              <Link to="/settings" className="text-ink/70 hover:text-ink">
                {user.displayName}
              </Link>
              <button
                onClick={logout}
                className="text-ink/60 hover:text-ink underline-offset-4 hover:underline"
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
