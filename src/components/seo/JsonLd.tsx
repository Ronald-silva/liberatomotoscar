/**
 * Publica dados estruturados no HTML. O conteúdo vem dos construtores em
 * `@/lib/structured-data`, nunca de texto digitado na página.
 */
export function JsonLd({ schema }: { schema: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, '\\u003c') }}
    />
  );
}
