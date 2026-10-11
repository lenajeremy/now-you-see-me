/** Studio is for signed-in people; src/proxy.ts sends everyone else to sign in. */
export default function StudioLayout({ children }: LayoutProps<'/studio'>) {
  return <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</div>;
}
