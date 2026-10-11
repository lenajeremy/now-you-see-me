import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Skeleton } from '@/components/ui/skeleton';
import { WatchView } from '@/components/watch/watch-view';
import { videoForMetadata } from '@/lib/metadata-data';
import { thumbnailUrl } from '@/lib/mux';

export async function generateMetadata({ params }: PageProps<'/watch/[id]'>): Promise<Metadata> {
  const { id } = await params;
  const data = await videoForMetadata(id);
  if (!data) return { title: 'Video unavailable' };
  const { video, channel } = data;
  const description = video.description.slice(0, 200) || `A 360° video by ${channel.name}. Step inside and look around.`;
  const image = video.playbackId
    ? thumbnailUrl(video.playbackId, { time: video.thumbnailTime, width: 1200 })
    : undefined;
  return {
    title: video.title,
    description,
    openGraph: { title: video.title, description, type: 'video.other', images: image ? [image] : [] },
    twitter: { card: 'summary_large_image', title: video.title, description, images: image ? [image] : [] },
  };
}

export default function WatchPage({ params }: PageProps<'/watch/[id]'>) {
  return (
    <Suspense fallback={<WatchSkeleton />}>
      <Watch params={params} />
    </Suspense>
  );
}

async function Watch({ params }: Pick<PageProps<'/watch/[id]'>, 'params'>) {
  const { id } = await params;
  return <WatchView id={id} />;
}

function WatchSkeleton() {
  return (
    <div className="mx-auto grid w-full max-w-[1800px] gap-8 px-4 py-4 sm:px-6 xl:grid-cols-[minmax(0,1fr)_400px]">
      <Skeleton className="aspect-video rounded-xl" />
    </div>
  );
}
