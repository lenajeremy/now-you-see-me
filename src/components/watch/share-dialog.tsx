'use client';

import { useState } from 'react';
import { Check, Copy, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

/** The link, a copy button, and the system share sheet where there is one. */
export function ShareDialog({ title, path, open, onOpenChange }: { title: string; path: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [copied, setCopied] = useState(false);
  // The dialog's contents only render once it's opened, in the browser.
  const url = typeof window === 'undefined' ? path : `${window.location.origin}${path}`;
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success('Link copied');
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share</DialogTitle>
          <DialogDescription>Anyone with the link can step inside “{title}”.</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input value={url} readOnly onFocus={(e) => e.target.select()} className="h-9 font-mono text-xs" />
          <Button onClick={copy} size="lg" className="shrink-0">
            {copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
        {canShare ? (
          <Button variant="outline" size="lg" onClick={() => navigator.share({ title, url }).catch(() => {})}>
            <Share2 /> More ways to share
          </Button>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
