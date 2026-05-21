import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { useUpdateProfile } from '@/hooks/useProfile';
import { api } from '@/lib/api';
import { PageHero } from '@/components/scrapbook/PageHero';

export function SettingsPage() {
  const { user } = useAuth();
  const updateProfile = useUpdateProfile();
  const [invite, setInvite] = useState<{ token: string; expiresAt: string } | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  // Inline edit for display name (展示名). Username (登录名) is fixed.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(user?.displayName ?? '');
  const [noticeKind, setNoticeKind] = useState<'ok' | 'err' | null>(null);
  const [noticeMsg, setNoticeMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep the draft in sync if the user record refreshes from /me while
  // we're not actively editing — prevents a stale displayName flash if
  // another tab edits it.
  useEffect(() => {
    if (!editing) setDraft(user?.displayName ?? '');
  }, [user?.displayName, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const flash = (kind: 'ok' | 'err', msg: string) => {
    setNoticeKind(kind);
    setNoticeMsg(msg);
    window.setTimeout(() => {
      setNoticeMsg(null);
      setNoticeKind(null);
    }, 2400);
  };

  const commit = async () => {
    const next = draft.trim();
    if (!user) return;
    if (next.length === 0 || next === user.displayName) {
      setEditing(false);
      setDraft(user.displayName);
      return;
    }
    try {
      await updateProfile.mutateAsync({ displayName: next });
      setEditing(false);
      flash('ok', '展示名已更新');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '保存失败';
      flash('err', msg);
    }
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setEditing(false);
      setDraft(user?.displayName ?? '');
    }
  };

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
      <PageHero
        emoji="⚙️"
        title="设置"
        subtitle="SETTINGS"
        motion="wobble"
        className="pb-6"
      />

      <section className="polaroid p-5">
        <h2 className="font-mono text-xs uppercase tracking-widest text-ink/60 dark:text-paper/60 mb-3">
          👤 账户
        </h2>

        {/* Login name — read-only, mono font hints "this is the key". */}
        <div className="flex items-baseline gap-3 text-sm">
          <span className="w-16 shrink-0 text-ink/55 dark:text-paper/55">
            登录名
          </span>
          <span className="font-mono text-ink/85 dark:text-paper/85">
            {user?.username}
          </span>
          <span className="ml-auto text-[10px] font-mono uppercase tracking-widest text-ink/35 dark:text-paper/40">
            不可改
          </span>
        </div>

        {/* Display name — inline editable. */}
        <div className="mt-3 flex items-center gap-3 text-sm">
          <span className="w-16 shrink-0 text-ink/55 dark:text-paper/55">
            展示名
          </span>
          <AnimatePresence mode="wait" initial={false}>
            {editing ? (
              <motion.div
                key="editing"
                initial={{ opacity: 0, y: -3 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -3 }}
                transition={{ duration: 0.16 }}
                className="flex flex-1 items-center gap-2"
              >
                <input
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={onKey}
                  onBlur={commit}
                  disabled={updateProfile.isPending}
                  maxLength={64}
                  className="flex-1 bg-transparent border-b-2 border-kraft/50 px-1 py-0.5 text-ink outline-none focus:border-kraft dark:border-paper/30 dark:text-paper dark:focus:border-paper/70 disabled:opacity-60"
                  aria-label="展示名"
                  placeholder="想被怎么称呼？"
                />
                <span className="font-mono text-[10px] uppercase tracking-widest text-ink/40 dark:text-paper/45">
                  Enter 保存 · Esc 取消
                </span>
              </motion.div>
            ) : (
              <motion.div
                key="reading"
                initial={{ opacity: 0, y: -3 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -3 }}
                transition={{ duration: 0.16 }}
                className="flex flex-1 items-center gap-2 group"
              >
                <span className="text-ink/85 dark:text-paper/90">
                  {user?.displayName}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setDraft(user?.displayName ?? '');
                    setEditing(true);
                  }}
                  aria-label="修改展示名"
                  title="修改展示名"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full text-sm text-ink/40 opacity-70 transition group-hover:opacity-100 hover:bg-kraft/15 hover:text-ink/70 dark:text-paper/45 dark:hover:bg-paper/10 dark:hover:text-paper/80"
                >
                  ✏️
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {noticeMsg ? (
            <motion.p
              key={noticeKind}
              initial={{ opacity: 0, y: -2 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={
                'mt-3 inline-block rounded-full px-3 py-0.5 text-xs ' +
                (noticeKind === 'ok'
                  ? 'bg-kraft/20 text-ink/80 dark:bg-paper/10 dark:text-paper/85'
                  : 'bg-pin-red/15 text-pin-red')
              }
            >
              {noticeMsg}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </section>

      <section className="polaroid p-5 mt-8">
        <h2 className="font-mono text-xs uppercase tracking-widest text-ink/60 dark:text-paper/60 mb-3">
          💌 邀请家人
        </h2>
        <p className="text-sm text-ink/70 dark:text-paper/70 mb-3">
          生成一个一次性邀请口令，发送给家人即可加入 🏡
        </p>
        <button
          onClick={generateInvite}
          disabled={busy}
          className="bg-kraft text-paper px-4 py-2 rounded-sm hover:bg-kraft-dark disabled:opacity-50"
        >
          {busy ? '生成中…' : '✨ 生成邀请'}
        </button>
        {invite && inviteUrl ? (
          <div className="mt-4 space-y-2">
            <p className="font-mono text-xs text-ink/60 dark:text-paper/55">
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
