import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ChannelView } from '@/components/channel/channel-view';
import { channelForMetadata } from '@/lib/metadata-data';

/** Reached at /@handle (see next.config.ts). */
export async function generateMetadata({ params }: PageProps<'/channel/[handle]'>): Promise<Metadata> {
  const { handle } = await params;
  const data = await channelForMetadata(decodeURIComponent(handle));
  if (!data) return { title: 'Channel not found' };
  const { channel } = data;
  return {
    title: `${channel.name} (@${channel.handle})`,
    description: channel.description || `360° videos from ${channel.name}.`,
    openGraph: { images: channel.avatarUrl ? [channel.avatarUrl] : [] },
  };
}

export default function ChannelPage({ params }: PageProps<'/channel/[handle]'>) {
  return (
    <Suspense>
      <Channel params={params} />
    </Suspense>
  );
}

async function Channel({ params }: Pick<PageProps<'/channel/[handle]'>, 'params'>) {
  const { handle } = await params;
  return <ChannelView handle={handle} />;
}
