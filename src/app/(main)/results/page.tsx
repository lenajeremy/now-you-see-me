import { Suspense } from 'react';
import type { Metadata } from 'next';
import { SearchResults } from '@/components/feed/search-results';

export const metadata: Metadata = { title: 'Search' };

export default function ResultsPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <Suspense>
        <SearchResults />
      </Suspense>
    </div>
  );
}
