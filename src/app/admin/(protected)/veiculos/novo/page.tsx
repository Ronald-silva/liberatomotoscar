import type { Metadata } from 'next';
import Link from 'next/link';
import styles from '../../../admin.module.css';
import { VehicleTypeForm } from './VehicleTypeForm';

export const metadata: Metadata = { title: 'Cadastrar veículo', robots: { index: false, follow: false } };

export default function NewVehiclePage() {
  return <main id="conteudo" className={`${styles.screen} ${styles.listScreen}`}>
    <section className={styles.listPanel} aria-labelledby="novo-title">
      <header className={styles.topBar}>
        <div className={styles.topBarTitle}>
          <h1 id="novo-title" className={styles.heading}>Cadastrar veículo</h1>
          <p className={styles.intro}>Escolha o tipo para começar. Depois é só completar marca, modelo, preço e fotos.</p>
        </div>
        <div className={styles.topBarActions}>
          <Link className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonCompact}`} href="/admin">Voltar ao estoque</Link>
        </div>
      </header>
      <VehicleTypeForm />
    </section>
  </main>;
}
