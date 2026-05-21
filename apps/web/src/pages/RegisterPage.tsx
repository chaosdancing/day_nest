import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams, Navigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import type { AuthResponse } from '@daynest/shared';
import { HandwrittenText } from '@/components/scrapbook/HandwrittenText';

export function RegisterPage() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const existing = useAuthStore((s) => s.accessToken);
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [inviteToken, setInviteToken] = useState(search.get('token') ?? '');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (existing) return <Navigate to="/" replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.post<AuthResponse>('/auth/register', {
        inviteToken,
        username,
        displayName,
        password,
      });
      setAuth(res.data.user, res.data.accessToken);
      navigate('/', { replace: true });
    } catch (err) {
      setError(
        (err as { response?: { data?: { message?: string } } }).response?.data
          ?.message ?? '注册失败'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form
        onSubmit={onSubmit}
        className="polaroid w-full max-w-md"
        style={{ rotate: '1deg' }}
      >
        <div className="pb-2 pt-1 text-center">
          <motion.div
            className="text-4xl mb-1"
            aria-hidden
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
          >
            🏡
          </motion.div>
          <HandwrittenText as="h1" className="text-4xl block leading-tight">
            欢迎加入
          </HandwrittenText>
          <p className="font-mono text-xs text-ink/50 mt-1">DAYNEST · REGISTER</p>
        </div>
        <div className="px-2 space-y-3 pb-3">
          <label className="block">
            <span className="text-xs font-mono uppercase text-ink/60">邀请口令</span>
            <input
              type="text"
              value={inviteToken}
              onChange={(e) => setInviteToken(e.target.value)}
              required
              className="mt-1 w-full bg-paper/60 border-b-2 border-kraft/40 focus:border-kraft focus:outline-none px-1 py-1.5 text-base font-mono"
            />
          </label>
          <label className="block">
            <span className="text-xs font-mono uppercase text-ink/60">用户名 (英文)</span>
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              pattern="[a-zA-Z0-9_]{3,32}"
              className="mt-1 w-full bg-paper/60 border-b-2 border-kraft/40 focus:border-kraft focus:outline-none px-1 py-1.5 text-base"
            />
          </label>
          <label className="block">
            <span className="text-xs font-mono uppercase text-ink/60">称呼</span>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              className="mt-1 w-full bg-paper/60 border-b-2 border-kraft/40 focus:border-kraft focus:outline-none px-1 py-1.5 text-base"
            />
          </label>
          <label className="block">
            <span className="text-xs font-mono uppercase text-ink/60">设置密码 (≥ 8 位)</span>
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="mt-1 w-full bg-paper/60 border-b-2 border-kraft/40 focus:border-kraft focus:outline-none px-1 py-1.5 text-base"
            />
          </label>
          {error ? <p className="text-pin-red text-sm">{error}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-kraft text-paper py-2 rounded-sm font-medium hover:bg-kraft-dark disabled:opacity-50 transition-colors"
          >
            {loading ? '正在注册...' : '🌿 加入家庭'}
          </button>
          <p className="text-center text-xs text-ink/50">
            已经有账号？
            <Link to="/login" className="text-kraft-dark hover:underline ml-1">
              登录
            </Link>
          </p>
        </div>
      </form>
    </div>
  );
}
