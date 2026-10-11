'use client';

import Link from 'next/link';
import { SignInButton, useAuth } from '@clerk/nextjs';
import { BellRing } from 'lucide-react';
import { toast } from 'sonner';
import type { Id } from '@convex/_generated/dataModel';
import { Button, buttonVariants } from '@/components/ui/button';
import { errorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { useToggleSubscription } from './use-social';

/** Subscribe, Subscribed, or — on your own channel — a way to your Studio. */
export function SubscribeButton({
  channelId,
  subscribed,
  isOwner,
  className,
}: {
  channelId: Id<'channels'>;
  subscribed: boolean;
  isOwner: boolean;
  className?: string;
}) {
  const { isSignedIn } = useAuth();
  const toggle = useToggleSubscription();

  if (isOwner) {
    return (
      <Link href="/studio" className={cn(buttonVariants({ variant: 'secondary', size: 'lg' }), 'rounded-full px-4', className)}>
        Manage videos
      </Link>
    );
  }
  if (!isSignedIn) {
    return (
      <SignInButton mode="modal">
        <Button size="lg" className={cn('rounded-full bg-foreground px-4 text-background hover:bg-foreground/90', className)}>
          Subscribe
        </Button>
      </SignInButton>
    );
  }
  return (
    <Button
      size="lg"
      variant={subscribed ? 'secondary' : 'default'}
      className={cn('rounded-full px-4', !subscribed && 'bg-foreground text-background hover:bg-foreground/90', className)}
      onClick={() =>
        toggle({ channelId })
          .then((now) => now && toast.success('Subscribed — their new videos will be in your Subscriptions.'))
          .catch((error) => toast.error(errorMessage(error)))
      }
    >
      {subscribed ? (
        <>
          <BellRing /> Subscribed
        </>
      ) : (
        'Subscribe'
      )}
    </Button>
  );
}
