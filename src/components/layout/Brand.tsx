import Link from 'next/link';
import Image from 'next/image';
import { STORE } from '@/data/store';

type BrandVariant = 'negativa' | 'positiva';

const ARTE: Record<BrandVariant, string> = {
  negativa: '/logo-liberato-negativo.png',
  positiva: '/logo-liberato.png',
};

/**
 * Marca da loja, nas duas versões geradas a partir do mesmo desenho.
 *
 * `positiva` é o arquivo recebido da loja, todo preto com as listras vermelhas;
 * serve a fundos claros e carrega a placa branca atrás. `negativa` é a conversão
 * feita por `scripts/gerar-logo-negativa.py` e pousa direto no escuro, sem placa.
 * Como o site inteiro é escuro, a negativa é o padrão.
 */
export function Brand({
  priority = false,
  variant = 'negativa',
}: {
  priority?: boolean;
  variant?: BrandVariant;
}) {
  return (
    <Link className="brand" href="/" aria-label={`${STORE.name}, página inicial`}>
      <span className={`brand-art brand-art--${variant}`} aria-hidden="true">
        <Image
          src={ARTE[variant]}
          alt=""
          width={800}
          height={376}
          priority={priority}
          sizes="180px"
        />
      </span>
    </Link>
  );
}
