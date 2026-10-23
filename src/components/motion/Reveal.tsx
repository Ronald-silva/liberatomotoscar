'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/** Fração da altura da janela a partir da qual o conteúdo é revelado. */
const GATILHO = 0.85;

/**
 * Revela o conteúdo quando ele chega à tela.
 *
 * O estado inicial é visível, e é o JavaScript que esconde — nunca o
 * contrário. Sem isso, uma página servida com o script bloqueado nasceria em
 * branco. Pelo mesmo motivo, o que já está na tela no momento em que o efeito
 * roda não é escondido: senão o conteúdo acima da dobra piscaria.
 *
 * A verificação é por posição a cada quadro de rolagem, e não por
 * `IntersectionObserver`: num salto de âncora o elemento vai de "abaixo da
 * tela" direto para "acima da tela" sem cruzar nenhum limiar, o observador não
 * dispara, e a seção pulada ficaria invisível para sempre.
 *
 * A animação em si é CSS (`.revelar` em `globals.css`); aqui só se liga o
 * atributo que a dispara.
 */
export function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight * GATILHO) return;

    el.dataset.revelar = 'esperando';
    let agendado = false;

    const revelar = () => {
      el.dataset.revelar = 'pronto';
      window.removeEventListener('scroll', aoRolar);
      window.removeEventListener('resize', aoRolar);
    };

    const medir = () => {
      agendado = false;
      if (el.getBoundingClientRect().top < window.innerHeight * GATILHO) revelar();
    };

    function aoRolar() {
      if (agendado) return;
      agendado = true;
      requestAnimationFrame(medir);
    }

    window.addEventListener('scroll', aoRolar, { passive: true });
    window.addEventListener('resize', aoRolar, { passive: true });
    return () => {
      window.removeEventListener('scroll', aoRolar);
      window.removeEventListener('resize', aoRolar);
    };
  }, []);

  return (
    <div
      ref={ref}
      className="revelar"
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
