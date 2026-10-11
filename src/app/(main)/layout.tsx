import { Suspense } from 'react';
import { TopBar } from '@/components/shell/top-bar';
import { Skeleton } from '@/components/ui/skeleton';
import { SidebarNav } from '@/components/shell/sidebar-nav';

/** Every browsing page: the top bar, a sidebar on wide screens, and the page. */
export default function MainLayout({ children }: LayoutProps<'/'>) {
  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar />
      <div className="flex flex-1">
        <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-60 shrink-0 overflow-y-auto border-r border-border/60 p-3 lg:block">
          <Suspense fallback={<SidebarSkeleton />}>
            <SidebarNav />
          </Suspense>
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

function SidebarSkeleton() {
  return (
    <div className="flex flex-col gap-1.5">
      {Array.from({ length: 3 }, (_, i) => (
        <Skeleton key={i} className="h-10 rounded-lg" />
      ))}
    </div>
  );
}
