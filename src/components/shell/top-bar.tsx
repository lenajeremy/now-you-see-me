import { Suspense } from 'react';
import Link from 'next/link';
import { Show, SignInButton, UserButton } from '@clerk/nextjs';
import { Upload, UserRound } from 'lucide-react';
import { Brand } from '@/components/brand';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MobileNav } from './mobile-nav';
import { SearchBox } from './search-box';

export function TopBar() {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border/70 bg-background/85 px-3 backdrop-blur-xl sm:px-4">
      <MobileNav />
      <Brand className="shrink-0" />
      <div className="mx-auto hidden w-full max-w-xl sm:block">
        <Suspense>
          <SearchBox />
        </Suspense>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2 sm:ml-0">
        {/* Depends on the session cookie, so it streams in after the static shell. */}
        <Suspense fallback={<div className="h-9 w-24" />}>
          <AccountControls />
        </Suspense>
      </div>
    </header>
  );
}

function AccountControls() {
  return (
    <>
      <Show when="signed-in">
        <Link href="/studio/upload" className={cn(buttonVariants({ size: 'lg' }), 'rounded-full px-4')}>
          <Upload /> <span className="hidden sm:inline">Upload</span>
        </Link>
        <UserButton />
      </Show>
      <Show when="signed-out">
        <SignInButton>
          <button type="button" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'rounded-full px-4')}>
            <UserRound /> Sign in
          </button>
        </SignInButton>
      </Show>
    </>
  );
}
