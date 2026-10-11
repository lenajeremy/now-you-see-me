'use client';

import { useEffect, useRef } from 'react';
import { VideoOff } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Your own camera, small, in the corner of the player. */
export function SelfView({ stream, cameraOn }: { stream: MediaStream | null; cameraOn: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream;
  }, [stream]);
  if (!stream?.getVideoTracks().length) return null;
  return (
    <div className="pointer-events-none absolute top-3 left-3 z-10 w-28 overflow-hidden rounded-xl bg-black/60 ring-1 ring-white/20 sm:w-40">
      <video ref={ref} autoPlay muted playsInline className={cn('aspect-video w-full -scale-x-100 object-cover', !cameraOn && 'invisible')} />
      {!cameraOn ? (
        <div className="absolute inset-0 grid place-items-center">
          <VideoOff className="size-5 text-white/70" />
        </div>
      ) : null}
      <span className="absolute bottom-1 left-1.5 rounded bg-black/50 px-1.5 text-[10px] font-medium text-white">You</span>
    </div>
  );
}
