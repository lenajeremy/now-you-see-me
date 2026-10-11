import type { Metadata } from 'next';
import { SubscriptionsFeed } from '@/components/feed/subscriptions-feed';

export const metadata: Metadata = { title: 'Subscriptions' };

/** Signed-in only (see src/proxy.ts). */
export default function SubscriptionsPage() {
  return (
    <div className="mx-auto w-full max-w-[1800px] px-4 py-6 sm:px-6">
      <SubscriptionsFeed />
    </div>
  );
}
