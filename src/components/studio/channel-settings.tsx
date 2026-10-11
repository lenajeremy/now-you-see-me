'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { ImageUp, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@convex/_generated/api';
import type { Doc, Id } from '@convex/_generated/dataModel';
import { HandleField } from '@/components/channel/create-channel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { errorMessage } from '@/lib/errors';

/** Name, handle, description and banner. */
export function ChannelSettings({
  channel,
  open,
  onOpenChange,
}: {
  channel: Doc<'channels'>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {open ? <SettingsForm channel={channel} onDone={() => onOpenChange(false)} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function SettingsForm({ channel, onDone }: { channel: Doc<'channels'>; onDone: () => void }) {
  const update = useMutation(api.channels.update);
  const generateUploadUrl = useMutation(api.channels.generateBannerUploadUrl);
  const setBanner = useMutation(api.channels.setBanner);
  const page = useQuery(api.channels.byHandle, { handle: channel.handle });
  const [name, setName] = useState(channel.name);
  const [handle, setHandle] = useState(channel.handle);
  const [description, setDescription] = useState(channel.description);
  const [saving, setSaving] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const bannerInput = useRef<HTMLInputElement>(null);

  async function uploadBanner(file: File) {
    if (!file.type.startsWith('image/')) return toast.error('Choose an image.');
    if (file.size > 6e6) return toast.error('Banners are up to 6 MB.');
    setUploadingBanner(true);
    try {
      const url = await generateUploadUrl();
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': file.type }, body: file });
      if (!response.ok) throw new Error('upload failed');
      const { storageId } = (await response.json()) as { storageId: Id<'_storage'> };
      await setBanner({ storageId });
      toast.success('Banner updated');
    } catch (error) {
      toast.error(errorMessage(error, 'Couldn’t upload the banner.'));
    } finally {
      setUploadingBanner(false);
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await update({ name, handle, description });
      toast.success('Channel saved');
      onDone();
    } catch (error) {
      toast.error(errorMessage(error));
      setSaving(false);
    }
  }

  const bannerUrl = page?.channel.bannerUrl;
  return (
    <form onSubmit={save} className="flex h-full flex-col">
      <SheetHeader>
        <SheetTitle>Customize channel</SheetTitle>
        <SheetDescription>How your channel looks to everyone.</SheetDescription>
      </SheetHeader>
      <div className="flex flex-1 flex-col gap-6 px-4">
        <div className="flex flex-col gap-2">
          <Label>Banner</Label>
          <button
            type="button"
            onClick={() => bannerInput.current?.click()}
            className="group relative grid aspect-[4/1] place-items-center overflow-hidden rounded-xl border border-dashed bg-muted/40 bg-cover bg-center"
            style={bannerUrl ? { backgroundImage: `url(${bannerUrl})` } : undefined}
          >
            <span className="flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-xs font-medium text-white opacity-90 backdrop-blur group-hover:opacity-100">
              {uploadingBanner ? <Loader2 className="size-3.5 animate-spin" /> : <ImageUp className="size-3.5" />}
              {bannerUrl ? 'Change banner' : 'Add a banner'}
            </span>
          </button>
          <p className="text-xs text-muted-foreground">
            Wide images work best (2048×512). Without one, your newest video’s panorama is used.
          </p>
          <input
            ref={bannerInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void uploadBanner(file);
            }}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="settings-name">Name</Label>
          <Input id="settings-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />
        </div>
        <HandleField value={handle} onChange={setHandle} current={channel.handle} />
        <div className="flex flex-col gap-2">
          <Label htmlFor="settings-description">Description</Label>
          <Textarea
            id="settings-description"
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 1000))}
            placeholder="What will people find on your channel?"
            className="min-h-28"
          />
        </div>
      </div>
      <SheetFooter className="flex-row justify-end">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving || !name.trim()}>
          {saving ? <Loader2 className="animate-spin" /> : null}
          Save
        </Button>
      </SheetFooter>
    </form>
  );
}
