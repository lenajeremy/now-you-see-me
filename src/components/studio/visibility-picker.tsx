'use client';

import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';
import { VISIBILITY, VISIBILITY_ORDER, type Visibility } from './visibility';

/** Public / Unlisted / Private as cards you pick one of. */
export function VisibilityPicker({ value, onChange }: { value: Visibility; onChange: (value: Visibility) => void }) {
  return (
    <RadioGroup value={value} onValueChange={(next) => onChange(next as Visibility)} className="gap-2">
      {VISIBILITY_ORDER.map((key) => {
        const { label, description, icon: Icon } = VISIBILITY[key];
        return (
          <label
            key={key}
            className={cn(
              'flex cursor-pointer items-center gap-3 rounded-xl border bg-card/40 p-3.5 transition-colors hover:bg-muted/50',
              value === key && 'border-primary/60 bg-primary/5',
            )}
          >
            <RadioGroupItem value={key} />
            <Icon className="size-4 text-muted-foreground" />
            <span className="flex flex-col">
              <span className="text-sm font-medium">{label}</span>
              <span className="text-xs text-muted-foreground">{description}</span>
            </span>
          </label>
        );
      })}
    </RadioGroup>
  );
}
