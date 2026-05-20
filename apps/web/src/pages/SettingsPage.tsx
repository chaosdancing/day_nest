import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import { HandwrittenText } from '@/components/scrapbook/HandwrittenText';

export function SettingsPage() {
  const { user } = useAuth();
  const [invite, setInvite] = useState<{ token: string; expiresAt: string } | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const generateInvite = async () => {
    setBusy(true);
    try {
      const res = await api.post<{ token: string; expiresAt: string }>(
        '/invites'
      );
      setInvite(res.data);
    } finally {
      setBusy(false);
    }
  };

  const inviteUrl = invite
    ? `${window.location.origin}/register?token=${encodeURIComponent(invite.token)}`
    : null;

  return (
    <div className="max-w-xl mx-auto pb-16">
      <div className="text-center pb-6">
        <HandwrittenText as="h1" className="text-5xl block">
          设置
        </HandwrittenText>
        <p className="font-mono text-xs tracking-widest text-ink/50 mt-2">
          SETTINGS
        </p>
      </div>

      <section className="polaroid p-5">
        <h2 className="font-mono text-xs uppercase tracking-widest text-ink/60 mb-3">
          账户
        </h2>
        <p className="text-sm">
          <span className="text-ink/60">用户名：</span>
          <span className="font-mono">{user?.username}</span>
        </p>
        <p className="text-sm mt-1">
          <span className="text-ink/60">称呼：</span>
          <span>{user?.displayName}</span>
        </p>
      </section>

      <section className="polaroid p-5 mt-8">
        <h2 className="font-mono text-xs uppercase tracking-widest text-ink/60 mb-3">
          邀请家人
        </h2>
        <p className="text-sm text-ink/70 mb-3">
          生成一个一次性邀请口令，发送给家人即可加入。
        </p>
        <button
          onClick={generateInvite}
          disabled={busy}
          className="bg-kraft text-paper px-4 py-2 rounded-sm hover:bg-kraft-dark disabled:opacity-50"
        >
          {busy ? '生成中…' : '生成邀请'}
        </button>
        {invite && inviteUrl ? (
          <div className="mt-4 space-y-2">
            <p className="font-mono text-xs text-ink/60">
              过期：{new Date(invite.expiresAt).toLocaleString()}
            </p>
            <div className="flex gap-2">
              <input
                readOnly
                value={inviteUrl}
                className="input font-mono text-xs"
                onFocus={(e) => e.currentTarget.select()}
              />
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(inviteUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="px-3 py-1.5 bg-paper-dark text-ink rounded-sm hover:bg-kraft/30"
              >
                {copied ? '已复制' : '复制'}
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
