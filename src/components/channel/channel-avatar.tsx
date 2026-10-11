import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { initials } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Soft colours for avatars without a picture, picked by name so each channel keeps its own. */
const TINTS = [
  'bg-sky-500/25 text-sky-200',
  'bg-emerald-500/25 text-emerald-200',
  'bg-amber-500/25 text-amber-200',
  'bg-rose-500/25 text-rose-200',
  'bg-violet-500/25 text-violet-200',
  'bg-teal-500/25 text-teal-200',
];

function tint(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return TINTS[Math.abs(hash) % TINTS.length]!;
}

export function ChannelAvatar({ name, imageUrl, className }: { name: string; imageUrl?: string | null; className?: string }) {
  return (
    <Avatar className={cn('size-9', className)}>
      {imageUrl ? <AvatarImage src={imageUrl} alt="" /> : null}
      <AvatarFallback className={cn('font-medium', tint(name))}>{initials(name) || '?'}</AvatarFallback>
    </Avatar>
  );
}
