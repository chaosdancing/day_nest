import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { AppHeader } from './AppHeader';

export function AppShell() {
  return (
    <div className="min-h-full flex flex-col">
      <AppHeader />
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {/* Suspense boundary inside the shell so route-level lazy
            chunks load with the header + chrome already visible. */}
        <Suspense
          fallback={
            <div className="text-center py-16 font-hand text-ink/55 dark:text-paper/55">
              <span className="inline-block animate-pulse text-2xl">📄</span>
              <p className="mt-2 text-sm">正在翻页…</p>
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
