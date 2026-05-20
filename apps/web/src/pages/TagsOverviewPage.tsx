import { Link } from 'react-router-dom';
import { useTags } from '@/hooks/useTags';
import { TapeBadge } from '@/components/scrapbook/TapeBadge';
import { HandwrittenText } from '@/components/scrapbook/HandwrittenText';

export function TagsOverviewPage() {
  const q = useTags();
  if (q.isLoading) {
    return <div className="text-center text-ink/60 py-16">正在整理标签...</div>;
  }
  const tags = q.data ?? [];
  if (tags.length === 0) {
    return (
      <div className="text-center py-20">
        <HandwrittenText className="text-3xl block">还没有标签</HandwrittenText>
        <p className="mt-3 text-ink/60 text-sm">上传照片时给它们打几个标签吧。</p>
      </div>
    );
  }

  const hot = tags.slice(0, 8);
  const rest = tags.slice(8);

  return (
    <div className="pb-24">
      <div className="text-center pb-6">
        <HandwrittenText as="h1" className="text-5xl block">
          标签
        </HandwrittenText>
        <p className="font-mono text-xs tracking-widest text-ink/50 mt-2">
          TAGS · {tags.length} TOTAL
        </p>
      </div>

      <section className="mb-10">
        <h2 className="font-mono text-xs uppercase tracking-widest text-ink/60 mb-3">
          热门
        </h2>
        <div className="flex flex-wrap gap-3">
          {hot.map((t) => (
            <Link key={t.id} to={`/tags/${encodeURIComponent(t.name)}`}>
              <TapeBadge tiltSeed={t.id}>
                {t.displayName}
                <span className="ml-2 text-xs font-mono opacity-70">
                  {(t.collectionCount ?? 0) + (t.photoCount ?? 0)}
                </span>
              </TapeBadge>
            </Link>
          ))}
        </div>
      </section>

      {rest.length > 0 ? (
        <section>
          <h2 className="font-mono text-xs uppercase tracking-widest text-ink/60 mb-3">
            其他
          </h2>
          <div className="flex flex-wrap gap-2">
            {rest.map((t) => (
              <Link
                key={t.id}
                to={`/tags/${encodeURIComponent(t.name)}`}
                className="px-2 py-1 text-sm text-ink/70 hover:text-ink hover:bg-paper-dark/40 rounded transition-colors"
              >
                {t.displayName}
                <span className="ml-1 text-xs text-ink/40">
                  {(t.collectionCount ?? 0) + (t.photoCount ?? 0)}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
