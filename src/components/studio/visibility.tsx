import { Globe2, Link2, Lock, type LucideIcon } from 'lucide-react';
import type { Doc } from '@convex/_generated/dataModel';

export type Visibility = Doc<'videos'>['visibility'];

export const VISIBILITY: Record<Visibility, { label: string; description: string; icon: LucideIcon }> = {
  public: { label: 'Public', description: 'Anyone can find and watch it.', icon: Globe2 },
  unlisted: { label: 'Unlisted', description: 'Only people with the link can watch it.', icon: Link2 },
  private: { label: 'Private', description: 'Only you can watch it.', icon: Lock },
};

export const VISIBILITY_ORDER: Visibility[] = ['public', 'unlisted', 'private'];
