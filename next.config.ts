import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Rede de segurança para o Railway: `RAILWAY_PUBLIC_DOMAIN` não tem o prefixo NEXT_PUBLIC_ e
  // por isso não chegaria ao bundle do cliente. Valores declarados aqui são sempre inlinados no
  // build, independente do prefixo. O caminho confiável continua sendo NEXT_PUBLIC_SITE_URL.
  env: {
    NEXT_PUBLIC_RAILWAY_PUBLIC_DOMAIN: process.env.RAILWAY_PUBLIC_DOMAIN ?? '',
  },
  turbopack: {
    root: process.cwd(),
  },
  experimental: {
    // Padrão é 1 MB; fotos reduzidas no navegador ficam abaixo disso, mas a margem evita falha. Vercel corta em 4,5 MB.
    serverActions: { bodySizeLimit: '4mb' },
    useTypeScriptCli: false,
  },
};

export default nextConfig;
