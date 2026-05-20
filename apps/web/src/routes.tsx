import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { TimelinePage } from './pages/TimelinePage';
import { TagsOverviewPage } from './pages/TagsOverviewPage';
import { TagPinboardPage } from './pages/TagPinboardPage';
import { CollectionDetailPage } from './pages/CollectionDetailPage';
import { PhotoViewerPage } from './pages/PhotoViewerPage';
import { UploadPage } from './pages/UploadPage';
import { SettingsPage } from './pages/SettingsPage';
import { AppShell } from './components/nav/AppShell';
import { useAuthStore } from './lib/auth';

function RequireAuth() {
  const token = useAuthStore((s) => s.accessToken);
  if (!token) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <TimelinePage /> },
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
