import { useState, type FormEvent } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
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
    <div className="min-h-screen flex items-center justify-center p-6">
      <form
        onSubmit={onSubmit}
        className="polaroid w-full max-w-sm"
        style={{ rotate: '-1.5deg' }}
      >
        <div className="pb-2 pt-1 text-center">
          <HandwrittenText as="h1" className="text-4xl block leading-tight">
            回到家
          </HandwrittenText>
          <p className="font-mono text-xs text-ink/50 mt-1">DAYNEST · LOGIN</p>
        </div>
        <div className="px-2 space-y-3 pb-3">
          <label className="block">
            <span className="text-xs font-mono uppercase text-ink/60">用户名</span>
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="mt-1 w-full bg-paper/60 border-b-2 border-kraft/40 focus:border-kraft focus:outline-none px-1 py-1.5 text-base"
            />
          </label>
          <label className="block">
            <span className="text-xs font-mono uppercase text-ink/60">密码</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-1 w-full bg-paper/60 border-b-2 border-kraft/40 focus:border-kraft focus:outline-none px-1 py-1.5 text-base"
            />
          </label>
          {error ? (
            <p className="text-pin-red text-sm">{error}</p>
          ) : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-kraft text-paper py-2 rounded-sm font-medium hover:bg-kraft-dark disabled:opacity-50 transition-colors"
          >
            {loading ? '正在打开...' : '推门进去'}
          </button>
        </div>
      </form>
    </div>
  );
}
