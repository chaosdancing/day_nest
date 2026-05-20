import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { useCollection } from '@/hooks/useCollections';
import { Polaroid } from '@/components/scrapbook/Polaroid';
import { TapeBadge } from '@/components/scrapbook/TapeBadge';
import { HandwrittenText } from '@/components/scrapbook/HandwrittenText';
import { deterministicTilt } from '@/lib/deterministicTilt';

export function CollectionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const q = useCollection(id);

  if (q.isLoading) {
    return <div className="text-center text-ink/60 py-16">正在翻开这一页...</div>;
  }
  if (q.isError || !q.data) {
    return (
      <div className="text-center py-16">
        <p className="text-ink/60 mb-2">这个集合不见了。</p>
        <Link to="/" className="text-kraft-dark underline">
          回到时间轴
        </Link>
      </div>
    );
  }

  const c = q.data;

  return (
    <div className="pb-24">
      <button
        onClick={() => navigate(-1)}
        className="text-sm text-ink/60 hover:text-ink mb-6"
      >
        ← 返回
      </button>

      <section className="mb-12">
        {c.coverPhoto ? (
          <Polaroid
            src={c.coverPhoto.thumbnailUrl}
            alt={c.title}
            tiltSeed={c.id}
            layoutId={`cover-${c.id}`}
            aspectRatio={16 / 10}
            className="max-w-2xl mx-auto"
          />
        ) : null}
        <div className="text-center mt-6">
          <p className="font-mono text-xs uppercase tracking-widest text-ink/50">
            {c.occurredOn}
            {c.occurredUntil ? ` – ${c.occurredUntil}` : ''}
            {c.location ? ` · ${c.location}` : ''}
          </p>
          <HandwrittenText as="h1" className="text-5xl block mt-2 leading-tight">
            {c.title}
          </HandwrittenText>
          {c.tags.length > 0 ? (
            <div className="flex flex-wrap justify-center gap-2 mt-4">
              {c.tags.map((t) => (
                <TapeBadge
                  key={t.id}
                  tiltSeed={`${c.id}-${t.id}`}
                  as="button"
                  onClick={() => navigate(`/tags/${encodeURIComponent(t.name)}`)}
                >
                  {t.displayName}
                </TapeBadge>
              ))}
            </div>
          ) : null}
          {c.description ? (
            <div className="prose prose-sm max-w-prose mx-auto mt-6 font-serif text-ink/85">
              <ReactMarkdown>{c.description}</ReactMarkdown>
            </div>
          ) : null}
        </div>
      </section>

      <ul
        className="grid gap-y-12 gap-x-6"
        style={{
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        }}
      >
        {c.photos.map((p, idx) => (
          <motion.li
            key={p.id}
            initial={{ opacity: 0, y: -40, rotate: 0 }}
            animate={{
              opacity: 1,
              y: 0,
              rotate: deterministicTilt(p.id, 4),
            }}
            transition={{
              delay: 0.06 * Math.min(idx, 12),
              duration: 0.5,
              ease: 'easeOut',
            }}
          >
            <Link to={`/c/${c.id}/p/${idx}`}>
              <Polaroid
                src={p.thumbnailUrl}
                alt={p.caption ?? ''}
                caption={p.caption}
                tiltSeed={p.id}
                aspectRatio={p.width / p.height}
              />
            </Link>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}
