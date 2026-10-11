import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import { shadcn } from '@clerk/ui/themes';
import { ConvexClientProvider } from '@/components/convex-client-provider';
import { OnboardingProvider } from '@/components/onboarding/onboarding';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

// Clerk titles its forms with the app's name in Clerk; say ours instead.
const LOCALIZATION = {
  signIn: { start: { title: 'Sign in to Now You See Me', subtitle: 'Welcome back! Sign in to continue.' } },
  signUp: { start: { title: 'Create your account', subtitle: 'Join Now You See Me to upload, subscribe and comment.' } },
};

// Absolute addresses for link previews: the production domain on Vercel, localhost otherwise.
const SITE_URL = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'Now You See Me', template: '%s · Now You See Me' },
  description: 'Watch and share 360° video you can stand inside.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <ClerkProvider
          appearance={{ theme: shadcn }}
          localization={LOCALIZATION}
          signInUrl="/sign-in"
          signUpUrl="/sign-up"
        >
          <ConvexClientProvider>
            <TooltipProvider>
              <OnboardingProvider>{children}</OnboardingProvider>
            </TooltipProvider>
            <Toaster />
          </ConvexClientProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
