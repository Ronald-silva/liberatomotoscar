import type { Metadata } from 'next';
import Link from 'next/link';
import styles from '../../../admin.module.css';
import { VehicleTypeForm } from './VehicleTypeForm';

export const metadata: Metadata = { title: 'Cadastrar veículo', robots: { index: false, follow: false } };

export default function NewVehiclePage() {
  return <main id="conteudo" className={`${styles.screen} ${styles.listScreen}`}>
    <section className={styles.listPanel} aria-labelledby="novo-title">
      <Link className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonCompact}`} href="/admin">Voltar ao estoque</Link>
      <h1 id="novo-title" className={styles.heading}>O que você vai cadastrar?</h1>
      <p className={styles.description}>Depois é só completar marca, modelo, preço e fotos.</p>
      <VehicleTypeForm />
    </section>
  </main>;
}
