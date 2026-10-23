'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';

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
  singleImageCaption = 'Visualização 360° disponível quando houver fotos do mesmo veículo em todos os ângulos.',
}: Viewer360Props) {
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const pointerX = useRef<number | null>(null);
  const isRotatable = images.length > 1;

  useEffect(() => {
    if (!isRotatable || !playing) return;
    const timer = window.setInterval(() => {
      setFrame((current) => (current + 1) % images.length);
    }, 140);
    return () => window.clearInterval(timer);
  }, [images.length, isRotatable, playing]);

  if (images.length === 0) return null;

  function step(delta: number) {
    setPlaying(false);
    setFrame((current) => (current + delta + images.length) % images.length);
  }

  return (
    <div className="viewer">
      <div
        className={`viewer-stage ${isRotatable ? 'viewer-stage--interactive' : ''}`}
        onPointerDown={isRotatable ? (event) => {
          pointerX.current = event.clientX;
          event.currentTarget.setPointerCapture(event.pointerId);
          setPlaying(false);
        } : undefined}
        onPointerMove={isRotatable ? (event) => {
          if (pointerX.current === null) return;
          const difference = event.clientX - pointerX.current;
          if (Math.abs(difference) >= 18) {
            setFrame((current) =>
              (current + (difference > 0 ? -1 : 1) + images.length) % images.length,
            );
            pointerX.current = event.clientX;
          }
        } : undefined}
        onPointerUp={() => { pointerX.current = null; }}
        onPointerCancel={() => { pointerX.current = null; }}
      >
        <Image
          src={images[frame]}
          alt={alt}
          fill
          sizes="(max-width: 900px) 100vw, 60vw"
          className="viewer-image"
          priority
        />
        <span className="viewer-badge">{badge}</span>
      </div>
      {isRotatable ? (
        <div className="viewer-controls">
          <p>Arraste a imagem ou use os controles para girar {title}.</p>
          <div>
            <button type="button" aria-label="Girar para a esquerda" onClick={() => step(-1)}>
              <ChevronLeft aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label={playing ? 'Pausar rotação' : 'Iniciar rotação'}
              onClick={() => setPlaying((value) => !value)}
            >
              {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
            </button>
            <button type="button" aria-label="Girar para a direita" onClick={() => step(1)}>
              <ChevronRight aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : (
        <p className="viewer-caption">{singleImageCaption}</p>
      )}
    </div>
  );
}
