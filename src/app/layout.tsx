import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { CampaignSync } from '@/components/marketing/CampaignSync';
import { AnalyticsConsent } from '@/components/marketing/AnalyticsConsent';
import './globals.css';

const bodyFont = localFont({
  src: './fonts/NotoSans-Regular.ttf',
  variable: '--font-body',
  display: 'swap',
});

const displayFont = localFont({
  src: './fonts/NotoSans-ExtraCondensedBlack.ttf',
  variable: '--font-display',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Liberato Motos Car | Compra, venda e troca em Fortaleza',
    template: '%s | Liberato Motos Car',
  },
  description:
    'Liberato Motos Car na Itaoca, Fortaleza. Conheça a proposta de compra, venda e troca de motos e carros e fale diretamente com a equipe.',
  icons: { icon: '/icon.svg' },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${bodyFont.variable} ${displayFont.variable}`}>
      <body>
        <a className="skip-link" href="#conteudo">Pular para o conteúdo</a>
        <CampaignSync />
        {children}
        <AnalyticsConsent />
      </body>
    </html>
  );
}
