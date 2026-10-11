import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SignIn } from '@clerk/nextjs';

export const metadata: Metadata = { title: 'Sign in' };

export default function SignInPage() {
  // Reads the URL, so it renders after the static shell.
  return (
    <Suspense fallback={<div className="h-[440px] w-[400px] max-w-full rounded-xl bg-card" />}>
      <SignIn />
    </Suspense>
  );
}
