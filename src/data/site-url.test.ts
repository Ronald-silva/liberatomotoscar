import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * SITE_URL é const de módulo, resolvida no import. Cada caso recarrega o módulo com o ambiente
 * desejado. Um link para localhost na mão do cliente é pior do que link nenhum, então a queda
 * para localhost em produção precisa ser audível.
 */
const CHAVES = [
  'NEXT_PUBLIC_SITE_URL',
  'NEXT_PUBLIC_RAILWAY_PUBLIC_DOMAIN',
  'NEXT_PUBLIC_VERCEL_URL',
] as const;

async function resolverCom(env: Partial<Record<string, string>>, nodeEnv = 'production') {
  const anterior = new Map<string, string | undefined>();
  for (const chave of [...CHAVES, 'NODE_ENV']) {
    anterior.set(chave, process.env[chave]);
    delete process.env[chave];
  }
  vi.stubEnv('NODE_ENV', nodeEnv);
  for (const [chave, valor] of Object.entries(env)) {
    if (valor !== undefined) vi.stubEnv(chave, valor);
  }
  vi.resetModules();
  const { SITE_URL } = await import('./store');
  for (const [chave, valor] of anterior) {
    if (valor === undefined) delete process.env[chave];
    else process.env[chave] = valor;
  }
  return SITE_URL;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('Resolução da URL pública do site', () => {
  it('usa NEXT_PUBLIC_SITE_URL quando definida', async () => {
    await expect(resolverCom({ NEXT_PUBLIC_SITE_URL: 'https://liberatomotos.com.br' }))
      .resolves.toBe('https://liberatomotos.com.br');
  });

  it('prefere a variável explícita ao domínio da plataforma', async () => {
    await expect(resolverCom({
      NEXT_PUBLIC_SITE_URL: 'https://liberatomotos.com.br',
      NEXT_PUBLIC_RAILWAY_PUBLIC_DOMAIN: 'app.up.railway.app',
      NEXT_PUBLIC_VERCEL_URL: 'app.vercel.app',
    })).resolves.toBe('https://liberatomotos.com.br');
  });

  it('cai no domínio do Railway como rede de segurança', async () => {
    await expect(resolverCom({ NEXT_PUBLIC_RAILWAY_PUBLIC_DOMAIN: 'liberato.up.railway.app' }))
      .resolves.toBe('https://liberato.up.railway.app');
  });

  it('avisa em produção quando nenhuma URL pública está configurada', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(resolverCom({})).resolves.toBe('http://localhost:3000');
    expect(erro).toHaveBeenCalledOnce();
    expect(erro.mock.calls[0]?.[0]).toContain('NEXT_PUBLIC_SITE_URL');
  });

  it('não polui o ambiente de desenvolvimento com o aviso', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(resolverCom({}, 'development')).resolves.toBe('http://localhost:3000');
    expect(erro).not.toHaveBeenCalled();
  });
});

/**
 * Parte do código concatena (`${SITE_URL}/veiculos/...`), então a barra final do painel viraria
 * `//veiculos/...` no canonical e nos dados estruturados — outra URL aos olhos do Google.
 */
describe('Normalização da URL pública', () => {
  it.each([
    ['https://liberatomotoscar-production.up.railway.app/', 'https://liberatomotoscar-production.up.railway.app'],
    ['https://liberatomotos.com.br///', 'https://liberatomotos.com.br'],
    ['  https://liberatomotos.com.br  ', 'https://liberatomotos.com.br'],
    ['https://liberatomotos.com.br', 'https://liberatomotos.com.br'],
  ])('normaliza %j', async (valor, esperado) => {
    await expect(resolverCom({ NEXT_PUBLIC_SITE_URL: valor })).resolves.toBe(esperado);
  });

  it('tira a barra final também do domínio da plataforma', async () => {
    await expect(resolverCom({ NEXT_PUBLIC_RAILWAY_PUBLIC_DOMAIN: 'liberato.up.railway.app/' }))
      .resolves.toBe('https://liberato.up.railway.app');
  });

  it('recusa valor sem esquema e avisa, em vez de gerar URL inválida', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(resolverCom({ NEXT_PUBLIC_SITE_URL: 'liberatomotos.com.br' }))
      .resolves.toBe('http://localhost:3000');
    expect(erro.mock.calls.some((c) => String(c[0]).includes('não é uma URL absoluta'))).toBe(true);
  });
});
