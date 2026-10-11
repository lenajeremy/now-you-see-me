'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { useQuery } from 'convex/react';
import { CircleHelp, UserRound } from 'lucide-react';
import { api } from '@convex/_generated/api';
import { ChannelAvatar } from '@/components/channel/channel-avatar';
import { useMe } from '@/hooks/use-me';
import { useOnboarding } from '@/components/onboarding/onboarding';
import { NAV_ITEMS } from './nav-items';
import { cn } from '@/lib/utils';

const LINK =
  'flex h-10 items-center gap-3 rounded-lg px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground';

/** The main sections, highlighted when you're in one. */
export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { isSignedIn } = useAuth();

  return (
    <div className="flex flex-col gap-4">
      <nav className="flex flex-col gap-0.5" aria-label="Main">
        {NAV_ITEMS.filter((item) => !item.signedIn || isSignedIn).map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={cn(LINK, active && 'bg-muted font-medium text-foreground')}
            >
              <Icon className="size-[18px]" />
              {label}
            </Link>
          );
        })}
        {isSignedIn ? <YourChannel pathname={pathname} onNavigate={onNavigate} /> : null}
      </nav>
      {isSignedIn ? <SubscribedChannels pathname={pathname} onNavigate={onNavigate} /> : null}
      <HowItWorks onNavigate={onNavigate} />
    </div>
  );
}

/** Opens the tour again. */
function HowItWorks({ onNavigate }: { onNavigate?: () => void }) {
  const { openTour } = useOnboarding();
  return (
    <div className="border-t pt-4">
      <button
        type="button"
        onClick={() => {
          onNavigate?.();
          openTour();
        }}
        className={cn(LINK, 'w-full')}
      >
        <CircleHelp className="size-[18px]" />
        How it works
      </button>
    </div>
  );
}

function YourChannel({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const me = useMe();
  if (me.status !== 'ready' || !me.channel) return null;
  const href = `/@${me.channel.handle}`;
  const active = pathname === href || pathname === `/channel/${me.channel.handle}`;
  return (
    <Link href={href} onClick={onNavigate} className={cn(LINK, active && 'bg-muted font-medium text-foreground')}>
      <UserRound className="size-[18px]" />
      Your channel
    </Link>
  );
}

/** The channels you subscribe to, like YouTube's sidebar. */
function SubscribedChannels({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const channels = useQuery(api.channels.subscribed);
  if (!channels?.length) return null;
  return (
    <section className="flex flex-col gap-0.5 border-t pt-4">
      <h2 className="px-3 pb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Subscriptions</h2>
      {channels.slice(0, 12).map((channel) => {
        const href = `/@${channel.handle}`;
        return (
          <Link
            key={channel._id}
            href={href}
            onClick={onNavigate}
            className={cn(LINK, 'h-9', pathname === href && 'bg-muted text-foreground')}
          >
            <ChannelAvatar name={channel.name} imageUrl={channel.avatarUrl} className="size-6 text-[10px]" />
            <span className="truncate">{channel.name}</span>
          </Link>
        );
      })}
      {channels.length > 12 ? (
        <Link href="/feed/subscriptions" onClick={onNavigate} className={cn(LINK, 'h-9')}>
          All subscriptions
        </Link>
      ) : null}
    </section>
  );
}
