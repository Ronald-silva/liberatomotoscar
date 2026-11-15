# Plano — definir `WHATSAPP_TOKEN_ENCRYPTION_KEY` sem perder o token do WhatsApp

_Escrito em 2026-11-15. **Plano, não execução.** Nada aqui foi rodado; nenhum segredo foi criado,
lido ou alterado. Executar só depois da sua aprovação._

## 1. O que está em jogo

Hoje a variável **não existe em nenhuma das duas produções**. Sem ela, `resolveEncryptionKey`
(`src/server/whatsapp/crypto.ts`) **deriva** a chave AES-256-GCM de outro segredo:

```
chave = sha256("whatsapp-token-aes256:" + semente)
semente = WHATSAPP_TOKEN_ENCRYPTION_KEY (se não for 64 hex)
       || META_APP_SECRET || WHATSAPP_APP_SECRET || ADMIN_SESSION_SECRET
```

Na prática a semente é o **`META_APP_SECRET`**, que existe nos dois hosts. Consequências:

- Girar o `META_APP_SECRET` (rotina normal de segurança da Meta) torna **ilegível todo token já
  salvo** em `whatsapp_tenants.encrypted_access_token`. Já aconteceu nesta mudança de hospedagem.
- Se o `META_APP_SECRET` do Railway e o da Vercel **não forem o mesmo valor**, o token gravado por
  um host já é ilegível para o outro — com o mesmo banco Neon atrás. Isso **precisa ser conferido
  antes** (passo 3).
- O token fica em colunas do banco no formato `iv:authTag:ciphertext` (hex). O banco sobrevive à
  troca de host; o segredo de origem, não.

**Objetivo:** passar a usar uma chave explícita de 64 hex, igual nos dois hosts (ou só no host
sobrevivente, se o corte de host vier antes), e reescrever o token já salvo com essa chave.

## 2. Pré-requisitos

- [ ] Decidir se o corte de host (`2026-11-host-unico.md`) vem **antes**. Recomendado: sim — fazer
      a chave duas vezes, uma por host, é trabalho e risco dobrados.
- [ ] Acesso ao painel da Meta (WhatsApp → API Setup) para gerar um token novo, caso o salvo não
      volte a ser legível.
- [ ] Acesso de admin ao painel da loja (`/admin/ajustes`), que é onde o token é regravado.
- [ ] Confirmar quantas linhas de tenant existem e quais estão ativas (consulta de leitura):

```sql
SELECT tenant_id, whatsapp_phone_number_id, is_active, updated_at,
       length(encrypted_access_token) AS tamanho
FROM whatsapp_tenants ORDER BY updated_at DESC;
```

Hoje a expectativa é uma linha ativa: `tenant_id = 'liberato-motos-car-teste'` (número de teste da
Meta). **Se houver mais de uma ativa, pare e reavalie** — o plano abaixo cobre o caso de uma.

## 3. Conferência prévia: os dois hosts derivam a mesma chave?

Sem imprimir o segredo em lugar nenhum, compare só o resumo:

```bash
# Em cada host (ou no painel de variáveis, copiando o valor para um shell local descartável):
printf '%s' "$META_APP_SECRET" | sha256sum | cut -c1-12
```

- Resumos **iguais** → os dois hosts leem o mesmo token. Caminho normal.
- Resumos **diferentes** → o token salvo só é legível no host que o gravou. Então o host que
  sobreviver é quem deve regravar o token, e a migração vira obrigatória, não opcional.

Não cole o valor do segredo em arquivo, issue, PR ou chat. Só o resumo de 12 caracteres.

## 4. Ensaio (obrigatório, antes de tocar em produção)

Objetivo do ensaio: provar que, depois de definir a chave e regravar, o envio volta a funcionar —
e provar que o rollback funciona.

1. **Branch do Neon** a partir da produção (cópia, não a produção):
   - Painel Neon → projeto da loja → Branches → _Create branch from_ `main`/produção, nome
     `ensaio-chave-20261116`. Copie a connection string dela.
2. **Rodar local apontando para a branch**, com a chave nova e o resto igual à produção:
   ```bash
   cp .env.example .env.ensaio   # preencha a partir dos valores de produção
   # DATABASE_URL = connection string da branch de ensaio
   # WHATSAPP_TOKEN_ENCRYPTION_KEY = $(openssl rand -hex 32)
   npm run dev
   ```
3. **Antes de regravar**, confirme que o token fica ilegível com a chave nova (é o efeito
   esperado): `/admin/ajustes` → “Conferir token salvo” deve responder
   _“Não foi possível ler o token salvo…”_ (`checkMetaTestNumberStatus`).
4. **Regravar** por um dos dois caminhos (ver passo 6) e repetir a conferência: agora precisa
   responder _“Token válido para o número de teste…”_.
5. **Ensaiar o rollback**: remova `WHATSAPP_TOKEN_ENCRYPTION_KEY` do `.env.ensaio`, reinicie e
   confira de novo. Esperado: volta a falhar a leitura (porque a linha foi regravada com a chave
   nova). **É esse o aprendizado do ensaio:** depois de regravar, voltar atrás exige restaurar o
   valor antigo da coluna — por isso o passo 6.1 copia a coluna antes.
6. Apague a branch de ensaio no fim.

Nada no ensaio toca o número real da loja nem manda mensagem a cliente. O `checkMetaTestNumberStatus`
faz uma chamada `GET` à Graph API com o token — leitura, sem envio.

## 5. Janela

- Tráfego real hoje é praticamente zero (o Railway recebeu **5 requisições em 7 dias**, todas de
  robô do Google; nenhuma chamada de webhook). Ou seja: **qualquer horário serve, desde que antes
  do anúncio para a loja**. Essa é a vantagem de fazer agora.
- Regra mesmo assim: janela de 30 min, fora de horário comercial (ex.: 21h–22h), com você
  acompanhando, e **nenhuma conversa aberta com cliente esperando resposta** (confira
  `/admin/atendimento`).
- Durante a janela, o pior caso é o envio falhar. Depois da Fase 0, falha de envio **não** deixa o
  cliente mudo: ele recebe a frase de indisponibilidade e a conversa vai para a fila do vendedor,
  com incidente contado em `falhasOperacionais`. Degradação, não silêncio.

## 6. Execução em produção

### 6.1 Copiar o estado atual (o que torna o rollback possível)

```sql
-- Guarda o valor cifrado atual. Tabela separada; nada é apagado.
CREATE TABLE IF NOT EXISTS whatsapp_tenants_backup_20261116 AS
SELECT id, tenant_id, whatsapp_phone_number_id, encrypted_access_token, updated_at
FROM whatsapp_tenants;

SELECT count(*) FROM whatsapp_tenants_backup_20261116;  -- confira que bate com a tabela viva
```

Anote também o resumo do `META_APP_SECRET` (passo 3) — é a chave antiga, indiretamente.

### 6.2 Gerar e definir a chave

```bash
openssl rand -hex 32     # 64 caracteres hex; NÃO guarde em arquivo do repositório
```

Defina `WHATSAPP_TOKEN_ENCRYPTION_KEY` **no host sobrevivente** (painel do Railway, ou
`vercel env add WHATSAPP_TOKEN_ENCRYPTION_KEY production`). Se os dois hosts continuarem de pé por
algum tempo, defina **o mesmo valor nos dois** — é a única forma de ambos lerem a mesma coluna.

Redeploy do host, para o processo pegar a variável.

### 6.3 Regravar o token (escolha um caminho)

**Caminho A — pelo painel, usando o token que já está no ambiente (recomendado).**
`/admin/ajustes` → “Ativar número de teste neste serviço”
(`activateConfiguredMetaTestNumber`): lê `WHATSAPP_TOKEN` do ambiente, valida na Graph API,
regrava a coluna cifrada **com a chave nova** e aponta o `override_callback_uri` da WABA para este
host. Exige, neste host: `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TOKEN` e
`WHATSAPP_WEBHOOK_CALLBACK_URL` (hoje a Vercel **não tem** a terceira — ver plano de host único).

**Caminho B — colar um token novo de API Setup.** `/admin/ajustes` → formulário de API Setup
(`registerMetaTestNumber`). Use se o `WHATSAPP_TOKEN` do ambiente estiver expirado (erro código
190 da Meta).

Não existe caminho C de “re-criptografar sem token”: para reescrever a coluna é preciso o token em
claro, e ele só é legível com a chave antiga ou vindo da Meta.

## 7. Como verificar que o token voltou a ser legível

Em ordem, do mais barato ao mais forte:

1. **Log do host**: depois do redeploy, o aviso
   `*** WHATSAPP_TOKEN_ENCRYPTION_KEY não definida ***` **não pode mais aparecer**.
2. **Painel**: `/admin/ajustes` → “Conferir token salvo” responde _“Token válido para o número de
   teste…”_. Isso prova decifragem + aceitação pela Meta (`GET /{phone_number_id}`).
3. **Banco** (leitura): a coluna mudou de valor e a linha foi atualizada —
   ```sql
   SELECT t.tenant_id, t.updated_at,
          (t.encrypted_access_token <> b.encrypted_access_token) AS regravado
   FROM whatsapp_tenants t
   JOIN whatsapp_tenants_backup_20261116 b ON b.id = t.id;
   ```
   `regravado = true` é o esperado no caminho A ou B.
4. **Ensaio real** (só com sua autorização explícita, conforme o AGENTS.md): mensagem do celular
   verificado para o número de teste → a Dayse responde. Critério:
   `falhasOperacionais = 0` e nenhum `envio_falhou` no log.

## 8. Rollback

| Situação | O que fazer |
|---|---|
| Chave definida, **token ainda não regravado**, e algo deu errado | Remover `WHATSAPP_TOKEN_ENCRYPTION_KEY` e redeploy. Volta à chave derivada; a coluna nunca mudou. Rollback completo. |
| Token **já regravado** e preciso voltar | Restaurar o valor antigo da coluna a partir do backup (SQL abaixo) **e** remover a variável. Os dois juntos, nessa ordem. |
| Banco em estado duvidoso | Neon → _Restore_ / branch por ponto no tempo anterior à janela. Último recurso: desfaz também qualquer conversa gravada na janela. |

```sql
UPDATE whatsapp_tenants t
SET encrypted_access_token = b.encrypted_access_token, updated_at = now()
FROM whatsapp_tenants_backup_20261116 b
WHERE b.id = t.id;
```

A tabela de backup só pode ser apagada depois de **uma semana** com envio funcionando.

## 9. Se o token não voltar a ser legível

Sintoma: “Não foi possível ler o token salvo” mesmo depois de regravar, ou erro 190 da Meta.

1. Não insista no mesmo caminho. Gere **token novo** em WhatsApp → API Setup e use o caminho B.
2. Se a Meta recusar o token novo: o problema não é a chave, é a credencial/permissão do app —
   confira `META_APP_ID`, `META_APP_SECRET` e as permissões do usuário do app.
3. Enquanto isso, o atendimento não fica mudo, mas fica **manual**: todo envio falha, cada conversa
   cai na fila do vendedor e o alerta (`OPS_ALERT_WEBHOOK_URL`, quando configurado) avisa. Avise a
   loja para responder pelo celular até resolver.
4. Caminho de desistência: remover a variável, restaurar a coluna do backup, redeploy. Volta ao
   estado de hoje — frágil, mas funcionando.

## 10. Decisões que são suas

- [ ] Fazer o corte de host **antes** da chave? (recomendado)
- [ ] Definir a chave só no host sobrevivente, ou o mesmo valor nos dois enquanto ambos existirem?
- [ ] Autorizar o ensaio real com o número de teste da Meta no fim do processo?
- [ ] Onde a chave fica guardada fora dos painéis (gerenciador de senhas)? Perder a chave **e** o
      `META_APP_SECRET` antigo significa regravar o token pela Meta.
