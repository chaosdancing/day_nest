import { Outlet } from 'react-router-dom';
import { AppHeader } from './AppHeader';

export function AppShell() {
  return (
    <div className="min-h-full flex flex-col">
      <AppHeader />
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <Outlet />
      </main>
    </div>
  );
}
