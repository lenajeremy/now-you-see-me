import { Clapperboard, Home, Library, type LucideIcon } from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Only shown to signed-in people. */
  signedIn?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/feed/subscriptions', label: 'Subscriptions', icon: Library, signedIn: true },
  { href: '/studio', label: 'Studio', icon: Clapperboard, signedIn: true },
];
