import type { Metadata } from 'next';
import { Archivo, Space_Mono } from 'next/font/google';
import { CampaignSync } from '@/components/marketing/CampaignSync';
import { AnalyticsConsent } from '@/components/marketing/AnalyticsConsent';
import { SITE_URL, STORE, STORE_ADDRESS_LINE } from '@/data/store';
import './globals.css';

/**
 * Archivo é variável (400–900), então uma única chamada atende corpo e display;
 * o peso 900 dos títulos é escolhido no CSS. `--font-body` e `--font-display`
 * continuam existindo como nomes separados em `globals.css`.
 */
const archivo = Archivo({
  subsets: ['latin'],
  variable: '--font-archivo',
  display: 'swap',
});

const monoFont = Space_Mono({
  subsets: ['latin'],
  weight: '700',
  variable: '--font-mono',
  display: 'swap',
});

const DESCRIPTION =
  `${STORE.name} na ${STORE.district}, ${STORE.city}. Conheça a proposta de compra, venda e troca de motos e carros e fale diretamente com a equipe.`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Liberato Motos Car | Compra, venda e troca em Fortaleza',
    template: '%s | Liberato Motos Car',
  },
  description: DESCRIPTION,
  icons: { icon: '/icon.svg' },
  robots: { index: false, follow: false },
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: STORE.name,
    title: `${STORE.name} | ${STORE.tagline} em ${STORE.city}`,
    description: DESCRIPTION,
    url: '/',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${STORE.name} | ${STORE.tagline} em ${STORE.city}`,
    description: DESCRIPTION,
  },
  other: { 'business:contact_data:street_address': STORE_ADDRESS_LINE },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${archivo.variable} ${monoFont.variable}`}>
      <body>
        <a className="skip-link" href="#conteudo">Pular para o conteúdo</a>
        <CampaignSync />
        {children}
        <AnalyticsConsent />
      </body>
    </html>
  );
}
