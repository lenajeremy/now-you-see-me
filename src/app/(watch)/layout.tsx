import { TopBar } from '@/components/shell/top-bar';

/** Watching: the top bar and the video, with no sidebar taking room from it. */
export default function WatchLayout({ children }: LayoutProps<'/'>) {
  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
