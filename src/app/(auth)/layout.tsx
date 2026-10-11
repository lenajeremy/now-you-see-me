import { Brand } from '@/components/brand';

/** Sign in and sign up: centred, on a quiet backdrop. */
export default function AuthLayout({ children }: LayoutProps<'/'>) {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center gap-8 px-4 py-12">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,color-mix(in_oklch,var(--color-primary)_14%,transparent),transparent)]"
      />
      <Brand className="relative" />
      <div className="relative">{children}</div>
    </main>
  );
}
