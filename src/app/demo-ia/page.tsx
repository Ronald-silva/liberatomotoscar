import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Brand } from '@/components/layout/Brand';
import { getAdminIdentity } from '@/server/authz';
import { DemoChat } from './DemoChat';
import styles from './demo.module.css';

export const metadata: Metadata = { title: 'Demonstração de IA', robots: { index: false, follow: false } };
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function DemoIaPage() {
  if (!await getAdminIdentity()) redirect('/admin/login');
  const enabled = process.env.DEMO_AI_ENABLED === 'true';

  return <main id="conteudo" className={styles.shell}>
    <div className={styles.frame}>
      <div className={styles.top}>
        <Brand />
        <Link className={styles.back} href="/">Voltar ao site</Link>
      </div>
      <div className={styles.layout}>
        <div className={styles.aside}>
          <span className={styles.eyebrow}>Liberato Inteligente · demonstração</span>
          <h1 className={styles.title}>Um estoque. Uma conversa.</h1>
          <p className={styles.intro}>Peça uma moto ou um carro do seu jeito. O assistente consulta os anúncios publicados antes de mostrar opções e sabe quando envolver a equipe.</p>
          <ul className={styles.facts}>
            <li><strong>Estoque real</strong> Preços e links vêm dos anúncios publicados.</li>
            <li><strong>Conversa natural</strong> Preferências, orçamento e momento da compra.</li>
            <li><strong>Decisão humana</strong> Troca, crédito e negociação ficam com a loja.</li>
          </ul>
        </div>
        <DemoChat enabled={enabled} />
      </div>
    </div>
  </main>;
}
