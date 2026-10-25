import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
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
