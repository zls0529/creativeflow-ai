import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'CreativeFlow AI — Campaign studio', description: 'A creative direction workspace with brand agents, campaign assets and a visible feedback loop.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
