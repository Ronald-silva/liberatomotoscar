import { ImageResponse } from 'next/og';
import { STORE } from '@/data/store';
import {
  INVENTORY_VEHICLES,
  formatKilometers,
  formatPrice,
  getInventoryVehicle,
} from '@/data/inventory-vehicles';
import { DEMO_VEHICLES, getDemoVehicle } from '@/data/mock-vehicles';
import { OG_CONTENT_TYPE, OG_SIZE, loadOgFonts, loadPublicImage } from '@/lib/og';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = `Veículo anunciado pela ${STORE.name}`;

export function generateStaticParams() {
  return [...INVENTORY_VEHICLES, ...DEMO_VEHICLES].map((vehicle) => ({ slug: vehicle.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const stockVehicle = getInventoryVehicle(slug);
  const demoVehicle = stockVehicle ? undefined : getDemoVehicle(slug);
  const vehicle = stockVehicle ?? demoVehicle;

  if (!vehicle) return new Response('Not found', { status: 404 });

  const [fonts, photo] = await Promise.all([loadOgFonts(), loadPublicImage(vehicle.image)]);

  const facts = stockVehicle
    ? [
        stockVehicle.year !== undefined ? String(stockVehicle.year) : undefined,
        stockVehicle.kilometers !== undefined
          ? formatKilometers(stockVehicle.kilometers)
          : undefined,
        stockVehicle.color,
      ].filter((fact): fact is string => Boolean(fact))
    : ['Apresentação ilustrativa'];

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: '#07090E',
          fontFamily: 'Body',
          color: '#F7F7F4',
        }}
      >
        <div
          style={{
            width: 640,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '64px 48px 56px 72px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 44, height: 4, background: '#D72531' }} />
            <div style={{ fontSize: 22, letterSpacing: 5, color: '#D72531' }}>
              {vehicle.categoryLabel.toUpperCase()}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div
              style={{
                display: 'flex',
                fontFamily: 'Display',
                fontSize: vehicle.title.length > 24 ? 74 : 94,
                lineHeight: 0.94,
                letterSpacing: -3,
                textTransform: 'uppercase',
              }}
            >
              {vehicle.title}
            </div>

            <div style={{ display: 'flex', gap: 20, marginTop: 26, fontSize: 25, color: '#9BA1AA' }}>
              {facts.map((fact) => (
                <div key={fact} style={{ display: 'flex' }}>
                  {fact}
                </div>
              ))}
            </div>

            {stockVehicle && (
              <div
                style={{
                  display: 'flex',
                  marginTop: 26,
                  fontFamily: 'Display',
                  fontSize: 68,
                  lineHeight: 1,
                }}
              >
                {formatPrice(stockVehicle.priceBRL)}
              </div>
            )}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              paddingTop: 26,
              borderTop: '1px solid rgba(255,255,255,0.16)',
              fontSize: 24,
              letterSpacing: 3,
            }}
          >
            <div style={{ display: 'flex', whiteSpace: 'nowrap' }}>LIBERATO</div>
            <div style={{ display: 'flex', whiteSpace: 'nowrap', color: '#D72531' }}>MOTOS CAR</div>
            <div style={{ display: 'flex', whiteSpace: 'nowrap', color: '#6E757E' }}>
              {`• ${STORE.city}/${STORE.state}`}
            </div>
          </div>
        </div>

        <div
          style={{
            width: 560,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#FFFFFF',
          }}
        >
          <img
            src={photo}
            alt=""
            width={560}
            height={630}
            style={{ width: 560, height: 630, objectFit: 'contain' }}
          />
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
