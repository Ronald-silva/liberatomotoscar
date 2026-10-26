import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// O ambiente padrão continua `node`: as suítes de serviço e de action falam com Postgres e não
// podem pagar o custo de um DOM. Os testes de componente e de hook (`.test.tsx`) pedem
// `happy-dom` no docblock do próprio arquivo (`// @vitest-environment happy-dom`), que vale só
// para ele.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { environment: 'node', include: ['src/**/*.test.ts', 'src/**/*.test.tsx'], testTimeout: 15000 },
});
