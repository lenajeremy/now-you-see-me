'use client';

import { useState } from 'react';
import { useMutation } from 'convex/react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@convex/_generated/api';
import type { Doc } from '@convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { PanoThumb } from '@/components/video/pano-thumb';
import { useDebounced } from '@/hooks/use-debounced';
import { errorMessage } from '@/lib/errors';
import { formatDuration } from '@/lib/format';
import { VisibilityPicker } from './visibility-picker';

const first = (value: number | readonly number[]) => (Array.isArray(value) ? value[0]! : (value as number));

/** Studio's editor: details, plus which moment and which direction the thumbnail (and the start) shows. */
export function EditVideoDialog({
  video,
  open,
  onOpenChange,
}: {
  video: Doc<'videos'>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
        {/* Remounts each time it opens, so it starts from the saved values. */}
        {open ? <EditForm video={video} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function EditForm({ video, onDone }: { video: Doc<'videos'>; onDone: () => void }) {
  const update = useMutation(api.videos.update);
  const [title, setTitle] = useState(video.title);
  const [description, setDescription] = useState(video.description);
  const [visibility, setVisibility] = useState(video.visibility);
  const [time, setTime] = useState(video.thumbnailTime ?? 0);
  const [facing, setFacing] = useState(video.facing ?? 0.5);
  const [saving, setSaving] = useState(false);
  const previewTime = useDebounced(time, 400);
  const ready = video.status === 'ready' && video.playbackId;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await update({
        id: video._id,
        title,
        description,
        visibility,
        ...(ready ? { thumbnailTime: time, facing } : {}),
      });
      toast.success('Saved');
      onDone();
    } catch (error) {
      toast.error(errorMessage(error));
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-6">
      <DialogHeader>
        <DialogTitle>Edit video</DialogTitle>
        <DialogDescription>Changes show everywhere as soon as you save.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,300px)]">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-title">Title</Label>
            <Input id="edit-title" value={title} onChange={(e) => setTitle(e.target.value.slice(0, 100))} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-description">Description</Label>
            <Textarea
              id="edit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 5000))}
              className="min-h-28"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Visibility</Label>
            <VisibilityPicker value={visibility} onChange={setVisibility} />
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <Label>Thumbnail and starting view</Label>
          <PanoThumb
            playbackId={ready ? video.playbackId : undefined}
            time={previewTime}
            facing={facing}
            width={960}
            className="rounded-xl ring-1 ring-white/10"
          />
          {ready ? (
            <>
              <div className="flex flex-col gap-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Moment</span>
                  <span className="tabular-nums">{formatDuration(time)}</span>
                </div>
                <Slider
                  value={[time]}
                  min={0}
                  max={Math.max(1, Math.floor(video.duration ?? 1))}
                  step={1}
                  onValueChange={(value) => setTime(first(value))}
                  aria-label="Thumbnail moment"
                />
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Direction viewers face first</span>
                  <span className="tabular-nums">{Math.round(facing * 360)}°</span>
                </div>
                <Slider
                  value={[facing]}
                  min={0}
                  max={1}
                  step={0.005}
                  onValueChange={(value) => setFacing(first(value))}
                  aria-label="Starting direction"
                />
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">You can pick these once the video has been processed.</p>
          )}
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving || !title.trim()}>
          {saving ? <Loader2 className="animate-spin" /> : null}
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}
