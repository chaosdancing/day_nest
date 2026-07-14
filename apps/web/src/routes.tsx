import { lazy, Suspense, type ComponentType } from 'react';
import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { TimelinePage } from './pages/TimelinePage';
import { AppShell } from './components/nav/AppShell';
import { useAuthStore } from './lib/auth';

/**
 * Wrap a named export in `React.lazy`. Our pages are named exports
 * (e.g. `export function UploadPage`), but `React.lazy` expects a
 * module with a default export, so we adapt with this helper. Kept
 * close to the route table so the import paths stay searchable.
 */
function lazyPage<K extends string>(
  load: () => Promise<Record<K, ComponentType<unknown>>>,
  name: K
) {
  return lazy(async () => {
    const mod = await load();
    return { default: mod[name] };
  });
}

// Bundle hot paths into the initial chunk (LoginPage + TimelinePage live
// at the top of every visit) and code-split everything else. Each lazy
// page lands in its own chunk so e.g. browser-image-compression + exifr
// only ship to users who actually open the upload screen.
const RegisterPage = lazyPage(() => import('./pages/RegisterPage'), 'RegisterPage');
const FavoritesPage = lazyPage(() => import('./pages/FavoritesPage'), 'FavoritesPage');
const TagsOverviewPage = lazyPage(
  () => import('./pages/TagsOverviewPage'),
  'TagsOverviewPage'
);
const TagPinboardPage = lazyPage(
  () => import('./pages/TagPinboardPage'),
  'TagPinboardPage'
);
const CollectionDetailPage = lazyPage(
  () => import('./pages/CollectionDetailPage'),
  'CollectionDetailPage'
);
const PhotoViewerPage = lazyPage(
  () => import('./pages/PhotoViewerPage'),
  'PhotoViewerPage'
);
const UploadPage = lazyPage(() => import('./pages/UploadPage'), 'UploadPage');
const SettingsPage = lazyPage(() => import('./pages/SettingsPage'), 'SettingsPage');

function RequireAuth() {
  const token = useAuthStore((s) => s.accessToken);
  if (!token) return <Navigate to="/login" replace />;
  return <Outlet />;
}

/**
 * Scrapbook-themed loading placeholder shown while a route chunk is in
 * flight. Lives outside any page module so it's part of the initial
 * bundle — no chunk required to render the chunk-loading state.
 */
function RouteFallback() {
  return (
    <div className="text-center py-16 font-hand text-ink/55 dark:text-paper/55">
      <span className="inline-block animate-pulse text-2xl">📄</span>
      <p className="mt-2 text-sm">正在翻页…</p>
    </div>
  );
}

function suspended(node: JSX.Element): JSX.Element {
  return <Suspense fallback={<RouteFallback />}>{node}</Suspense>;
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: suspended(<RegisterPage />) },
  {
    element: <RequireAuth />,
    children: [
      {
        // AppShell stays mounted across route changes so the header
        // and chrome are visible while a lazy chunk fetches. The
        // Suspense boundary lives inside AppShell (around <Outlet />)
        // so the fallback only replaces the page body, not the nav.
        element: <AppShell />,
        children: [
          { index: true, element: <TimelinePage /> },
          { path: 'favorites', element: <FavoritesPage /> },
          { path: 'tags', element: <TagsOverviewPage /> },
          { path: 'tags/:name', element: <TagPinboardPage /> },
          { path: 'c/:id', element: <CollectionDetailPage /> },
          { path: 'c/:id/p/:photoIndex', element: <PhotoViewerPage /> },
          { path: 'upload', element: <UploadPage /> },
          { path: 'settings', element: <SettingsPage /> },
        ],
      },
    ],
  },
]);
