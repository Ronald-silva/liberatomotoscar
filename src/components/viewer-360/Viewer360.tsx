'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, Maximize2, X } from 'lucide-react';

interface Viewer360Props {
  images: string[];
  alt: string;
  title: string;
  badge?: string;
  singleImageCaption?: string;
}

export function Viewer360({
  images,
  alt,
  title,
  badge = 'IMAGEM ILUSTRATIVA',
  singleImageCaption = '',
}: Viewer360Props) {
  const [frame, setFrame] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const pointerX = useRef<number | null>(null);
  const moved = useRef(false);
  const hasMultiple = images.length > 1;
  const activeFrame = frame < images.length ? frame : 0;

  useEffect(() => {
    if (!expanded) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setExpanded(false);
      else if (event.key === 'ArrowLeft' && hasMultiple) {
        setFrame((current) => (current - 1 + images.length) % images.length);
      } else if (event.key === 'ArrowRight' && hasMultiple) {
        setFrame((current) => (current + 1) % images.length);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [expanded, hasMultiple, images.length]);

  if (images.length === 0) return null;

  function step(delta: number) {
    setFrame((current) => (current + delta + images.length) % images.length);
  }

  const badgeLabel = hasMultiple ? `FOTO ${activeFrame + 1} DE ${images.length}` : badge;

  return (
    <div className="viewer">
      <div
        className={`viewer-stage ${hasMultiple ? 'viewer-stage--interactive' : ''}`}
        onPointerDown={(event) => {
          if ((event.target as HTMLElement).closest('button')) return;
          pointerX.current = event.clientX;
          moved.current = false;
          if (hasMultiple) event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={hasMultiple ? (event) => {
          if (pointerX.current === null) return;
          const difference = event.clientX - pointerX.current;
          if (Math.abs(difference) >= 28) {
            moved.current = true;
            setFrame((current) =>
              (current + (difference > 0 ? -1 : 1) + images.length) % images.length,
            );
            pointerX.current = event.clientX;
          }
        } : undefined}
        onPointerUp={(event) => {
          if ((event.target as HTMLElement).closest('button')) return;
          const wasTap = pointerX.current !== null && !moved.current;
          pointerX.current = null;
          if (wasTap) setExpanded(true);
        }}
        onPointerCancel={() => { pointerX.current = null; moved.current = false; }}
      >
        <span className="viewer-photo">
          <Image
            src={images[activeFrame]}
            unoptimized={images[activeFrame].startsWith('https://')}
            alt={`${alt} — foto ${activeFrame + 1} de ${images.length}`}
            fill
            sizes="(max-width: 900px) 100vw, 60vw"
            className="viewer-image"
            priority
          />
        </span>
        <span className="viewer-badge">{badgeLabel}</span>
        <button
          type="button"
          className="viewer-zoom-btn"
          aria-label={`Ampliar foto de ${title}`}
          onClick={() => setExpanded(true)}
        >
          <Maximize2 size={16} aria-hidden="true" />
          <span>Ampliar</span>
        </button>
      </div>

      {hasMultiple ? (
        <>
          <div className="viewer-thumbs" role="group" aria-label={`Miniaturas de ${title}`}>
            {images.map((src, index) => (
              <button
                key={`${src}-${index}`}
                type="button"
                className={`viewer-thumb ${index === activeFrame ? 'is-active' : ''}`}
                aria-label={`Ver foto ${index + 1} de ${images.length}`}
                aria-current={index === activeFrame ? 'true' : undefined}
                onClick={() => setFrame(index)}
              >
                <Image
                  src={src}
                  unoptimized={src.startsWith('https://')}
                  alt=""
                  fill
                  sizes="96px"
                  className="viewer-thumb-image"
                />
              </button>
            ))}
          </div>
          <div className="viewer-controls">
            <p>Toque nas miniaturas ou deslize para ver todos os ângulos de {title}.</p>
            <div>
              <button type="button" aria-label="Foto anterior" onClick={() => step(-1)}>
                <ChevronLeft aria-hidden="true" />
              </button>
              <button type="button" aria-label="Próxima foto" onClick={() => step(1)}>
                <ChevronRight aria-hidden="true" />
              </button>
            </div>
          </div>
        </>
      ) : singleImageCaption ? (
        <p className="viewer-caption">{singleImageCaption}</p>
      ) : null}

      {expanded ? (
        <div
          className="viewer-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`Foto ampliada de ${title}`}
          onClick={(event) => {
            if (event.target === event.currentTarget) setExpanded(false);
          }}
        >
          <div className="viewer-lightbox-bar">
            <span>{title} · {badgeLabel}</span>
            <button
              type="button"
              className="viewer-lightbox-close"
              aria-label="Fechar foto ampliada"
              onClick={() => setExpanded(false)}
            >
              <X size={20} aria-hidden="true" /> Fechar
            </button>
          </div>
          <div className="viewer-lightbox-stage">
            {hasMultiple ? (
              <button
                type="button"
                className="viewer-lightbox-nav viewer-lightbox-nav--prev"
                aria-label="Foto anterior"
                onClick={() => step(-1)}
              >
                <ChevronLeft size={24} aria-hidden="true" />
              </button>
            ) : null}
            <div className="viewer-lightbox-photo">
              <Image
                src={images[activeFrame]}
                unoptimized={images[activeFrame].startsWith('https://')}
                alt={`${alt} — foto ${activeFrame + 1} ampliada`}
                fill
                sizes="100vw"
                className="viewer-lightbox-image"
              />
            </div>
            {hasMultiple ? (
              <button
                type="button"
                className="viewer-lightbox-nav viewer-lightbox-nav--next"
                aria-label="Próxima foto"
                onClick={() => step(1)}
              >
                <ChevronRight size={24} aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
