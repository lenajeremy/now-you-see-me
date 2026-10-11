'use client';

import { useState } from 'react';
import { useMutation } from 'convex/react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@convex/_generated/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { errorMessage } from '@/lib/errors';

const REASONS = {
  video: ['It isn’t a 360° video', 'Violent or graphic', 'Hateful or abusive', 'Sexual content', 'Spam or misleading', 'Something else'],
  comment: ['Hateful or abusive', 'Harassment or bullying', 'Spam', 'Something else'],
};

/** Tell us what's wrong with a video or comment. */
export function ReportDialog({
  target,
  open,
  onOpenChange,
}: {
  target: { type: 'video' | 'comment'; id: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const report = useMutation(api.social.report);
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    setSending(true);
    try {
      await report({ targetType: target.type, targetId: target.id, reason: [reason, details.trim()].filter(Boolean).join(': ') });
      toast.success('Thanks — we’ll take a look.');
      onOpenChange(false);
      setReason('');
      setDetails('');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={send} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>Report {target.type === 'video' ? 'video' : 'comment'}</DialogTitle>
            <DialogDescription>What’s the problem? Reports are private.</DialogDescription>
          </DialogHeader>
          <RadioGroup value={reason} onValueChange={(value) => setReason(String(value))} className="gap-3">
            {REASONS[target.type].map((label) => (
              <Label key={label} className="flex cursor-pointer items-center gap-3 font-normal">
                <RadioGroupItem value={label} /> {label}
              </Label>
            ))}
          </RadioGroup>
          <Textarea value={details} onChange={(e) => setDetails(e.target.value.slice(0, 800))} placeholder="Anything else we should know? (optional)" />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!reason || sending}>
              {sending ? <Loader2 className="animate-spin" /> : null} Report
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
