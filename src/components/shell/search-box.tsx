'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';

/** Searches videos and channels; results open on their own page. */
export function SearchBox() {
  const router = useRouter();
  const params = useSearchParams();

  return (
    <form
      role="search"
      className="relative w-full"
      onSubmit={(e) => {
        e.preventDefault();
        const query = new FormData(e.currentTarget).get('q')?.toString().trim();
        if (query) router.push(`/results?q=${encodeURIComponent(query)}`);
      }}
    >
      <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        name="q"
        type="search"
        defaultValue={params.get('q') ?? ''}
        placeholder="Search 360° videos and channels"
        aria-label="Search"
        className="h-10 w-full rounded-full border border-input bg-muted/40 pr-4 pl-10 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:bg-muted/70"
      />
    </form>
  );
}
