import { motion } from 'framer-motion';
import type { LocalPhoto } from '@/lib/upload';

export type UploadPhase = 'uploading' | 'saving' | 'done' | 'failed';

type Props = {
  photos: LocalPhoto[];
  phase: UploadPhase;
  errorMessage?: string | null;
  onCancel?: () => void;
  onRetry?: () => void;
};

export function UploadProgress({
  photos,
  phase,
  errorMessage,
  onCancel,
  onRetry,
}: Props) {
  const total = photos.length;
  const done = photos.filter((p) => p.status === 'uploaded').length;
  const failed = photos.filter((p) => p.status === 'failed').length;
  const pct =
    total === 0
      ? 0
      : Math.round(
          photos.reduce(
            (s, p) =>
              s +
              (p.status === 'uploaded'
                ? 100
                : p.status === 'uploading'
                  ? p.progress
                  : 0),
            0
          ) / total
        );

  const title =
    phase === 'failed'
      ? '出了点意外'
      : phase === 'done'
        ? '已经收好啦 ✓'
        : phase === 'saving'
          ? '正在装订相册…'
          : '正在收进相册…';

  const subtitle =
    phase === 'saving'
      ? `${total} 张已传完，正在写入数据库…`
      : phase === 'failed'
        ? errorMessage ?? '请检查网络后重试'
        : `${done} / ${total} 张 · ${pct}%${failed > 0 ? ` · ${failed} 失败` : ''}`;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-start bg-paper/95 backdrop-blur-sm overflow-y-auto"
    >
      <div className="w-full max-w-3xl mx-auto px-6 py-10">
        <div className="text-center mb-6">
          <p className="font-mono text-xs tracking-widest text-ink/40 mb-1">
            DAYNEST · UPLOADING
          </p>
          <h2 className="font-hand text-4xl text-ink/85">{title}</h2>
          <p className="font-mono text-sm text-ink/60 mt-2">{subtitle}</p>
        </div>

        <div className="relative h-3 bg-kraft/15 rounded-full overflow-hidden mb-6 border border-kraft/30">
          <motion.div
            className={
              phase === 'failed'
                ? 'absolute inset-y-0 left-0 bg-pin-red/80'
                : 'absolute inset-y-0 left-0 bg-gradient-to-r from-kraft to-kraft-dark'
            }
            initial={{ width: 0 }}
            animate={{
              width:
                phase === 'saving' || phase === 'done' ? '100%' : `${pct}%`,
            }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          />
          {phase === 'saving' ? (
            <motion.div
              className="absolute inset-y-0 left-0 right-0 bg-paper/40"
              animate={{ x: ['-100%', '100%'] }}
              transition={{
                duration: 1.2,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              style={{ width: '40%' }}
            />
          ) : null}
        </div>

        <ul
          className="grid gap-2"
          style={{
            gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
          }}
        >
          {photos.map((p, i) => (
            <li key={i} className="relative aspect-square">
              <img
                src={p.previewUrl}
                className="absolute inset-0 w-full h-full object-cover rounded shadow-sm"
                style={{
                  filter:
                    p.status === 'uploaded'
                      ? 'none'
                      : p.status === 'failed'
                        ? 'grayscale(0.7) brightness(0.7)'
                        : 'brightness(0.6)',
                }}
                draggable={false}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                {p.status === 'uploaded' ? (
                  <span className="w-6 h-6 rounded-full bg-emerald-600/95 text-paper grid place-items-center text-sm">
                    ✓
                  </span>
                ) : p.status === 'failed' ? (
                  <span
                    className="w-6 h-6 rounded-full bg-pin-red text-paper grid place-items-center text-sm"
                    title={p.error}
                  >
                    !
                  </span>
                ) : p.status === 'uploading' ? (
                  <span className="font-mono text-xs text-paper bg-ink/60 px-1.5 py-0.5 rounded">
                    {p.progress}%
                  </span>
                ) : (
                  <span className="font-mono text-[10px] text-paper/80 bg-ink/40 px-1.5 py-0.5 rounded">
                    等待
                  </span>
                )}
              </div>
              {p.status === 'uploading' ? (
                <div className="absolute inset-x-0 bottom-0 h-1 bg-kraft/30 overflow-hidden rounded-b">
                  <div
                    className="h-full bg-kraft transition-all"
                    style={{ width: `${p.progress}%` }}
                  />
                </div>
              ) : null}
            </li>
          ))}
        </ul>

        <div className="flex justify-center gap-3 mt-8">
          {phase === 'failed' ? (
            <>
              <button
                type="button"
                onClick={onCancel}
                className="text-ink/60 hover:text-ink px-4 py-2"
              >
                返回修改
              </button>
              {onRetry ? (
                <button
                  type="button"
                  onClick={onRetry}
                  className="bg-kraft text-paper px-6 py-2.5 rounded-sm font-medium hover:bg-kraft-dark"
                >
                  重试失败的 {failed} 张
                </button>
              ) : null}
            </>
          ) : phase === 'uploading' && onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="text-ink/60 hover:text-ink px-4 py-2 text-sm"
            >
              取消上传
            </button>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}
