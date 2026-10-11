'use client';

import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { useUser } from '@clerk/nextjs';
import { Check, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@convex/_generated/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useDebounced } from '@/hooks/use-debounced';
import { errorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { ChannelAvatar } from './channel-avatar';

/** A starting handle from a name: "Jeremiah Lena" → "jeremiahlena". */
function suggestHandle(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, 30);
  return base.length >= 3 ? base : '';
}

/** Says, as you type, whether a handle can be yours. */
export function HandleField({
  value,
  onChange,
  current,
}: {
  value: string;
  onChange: (value: string) => void;
  /** The channel's handle now, which counts as available. */
  current?: string;
}) {
  const handle = useDebounced(value.trim().replace(/^@/, '').toLowerCase(), 250);
  const check = useQuery(api.channels.handleAvailable, handle ? { handle } : 'skip');
  const checking = handle !== value.trim().replace(/^@/, '').toLowerCase() || (handle && check === undefined);
  const mine = current && handle === current;
  const state = !value
    ? 'empty'
    : checking
      ? 'checking'
      : mine || (check?.valid && check.available)
        ? 'available'
        : check && !check.valid
          ? 'invalid'
          : 'taken';

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="handle">Handle</Label>
      <div
        className={cn(
          'flex h-10 items-center rounded-lg border border-input bg-input/30 pr-3 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50',
          state === 'available' && 'border-emerald-500/60',
          (state === 'taken' || state === 'invalid') && 'border-destructive/70',
        )}
      >
        <span className="pl-3 text-muted-foreground">@</span>
        <input
          id="handle"
          value={value}
          onChange={(event) => onChange(event.target.value.replace(/\s/g, '').toLowerCase())}
          className="h-full min-w-0 flex-1 bg-transparent pl-0.5 text-sm outline-none"
          autoComplete="off"
          spellCheck={false}
          maxLength={30}
          aria-describedby="handle-hint"
        />
        <span className="flex shrink-0 items-center gap-1 text-xs font-medium" aria-live="polite">
          {state === 'checking' ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" /> : null}
          {state === 'available' ? (
            <span className="flex items-center gap-1 text-emerald-400">
              Available <Check className="size-3.5" />
            </span>
          ) : null}
          {state === 'taken' ? (
            <span className="flex items-center gap-1 text-destructive">
              Taken <X className="size-3.5" />
            </span>
          ) : null}
        </span>
      </div>
      <p id="handle-hint" className={cn('text-xs text-muted-foreground', state === 'invalid' && 'text-destructive')}>
        {state === 'invalid'
          ? '3–30 lowercase letters, numbers, dots, dashes or underscores.'
          : `Your channel's address: /@${value || 'handle'}`}
      </p>
    </div>
  );
}

/** "Claim your handle": the one step before someone can upload. */
export function CreateChannel({
  title = 'Create your channel',
  subtitle = 'Your channel is where your 360° videos live. Pick a name, and a handle people can find you by.',
  onCreated,
}: {
  title?: string;
  subtitle?: string;
  onCreated?: (handle: string) => void;
}) {
  const { user } = useUser();
  const defaultName = user?.fullName || user?.username || '';
  const [name, setName] = useState<string | null>(null);
  const [handle, setHandle] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const create = useMutation(api.channels.create);

  const nameValue = name ?? defaultName;
  const handleValue = handle ?? suggestHandle(nameValue);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const created = await create({ name: nameValue, handle: handleValue });
      toast.success(`Welcome to your channel, @${created.handle}`);
      onCreated?.(created.handle);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto flex w-full max-w-md flex-col gap-6 rounded-2xl border bg-card p-6 sm:p-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <ChannelAvatar name={nameValue || '?'} imageUrl={user?.imageUrl} className="size-16 text-lg" />
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-pretty text-muted-foreground">{subtitle}</p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="channel-name">Channel name</Label>
        <Input
          id="channel-name"
          value={nameValue}
          onChange={(event) => setName(event.target.value)}
          maxLength={60}
          required
          className="h-10"
        />
      </div>
      <HandleField value={handleValue} onChange={setHandle} />
      <Button type="submit" size="lg" className="h-10 rounded-full" disabled={saving || !nameValue.trim() || handleValue.length < 3}>
        {saving ? <Loader2 className="animate-spin" /> : null}
        Create channel
      </Button>
    </form>
  );
}
