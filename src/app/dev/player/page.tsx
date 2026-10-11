import { notFound } from 'next/navigation';
import { WorldPlayer } from '@/components/player/world-player';

/** Development only: the 3D player on a local 360° video. */
export default function DevPlayerPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <main className="mx-auto max-w-6xl p-6">
      <WorldPlayer src="/dev-media/lake-bled/backdrop.mp4" facing={0.83} className="aspect-video w-full rounded-xl" />
    </main>
  );
}
