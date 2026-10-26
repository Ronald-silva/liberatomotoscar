import { ImageResponse } from 'next/og';
import { connection } from 'next/server';
import { STORE, STORE_ADDRESS_LINE } from '@/data/store';
import { OG_CONTENT_TYPE, OG_SIZE, loadOgFonts } from '@/lib/og';
import { listPublicVehicles } from '@/server/vehicles/service';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = `${STORE.name} — ${STORE.tagline} de motos e carros em ${STORE.city}`;

export default async function Image() {
  await connection();
  const [fonts, vehicles] = await Promise.all([loadOgFonts(), listPublicVehicles()]);
  const motos = vehicles.filter((vehicle) => vehicle.type === 'motorcycle').length;
  const carros = vehicles.length - motos;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          background: '#07090E',
          backgroundImage:
            'linear-gradient(115deg, rgba(215,37,49,0.22) 0%, rgba(215,37,49,0) 46%)',
          fontFamily: 'Body',
          color: '#F7F7F4',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ width: 54, height: 4, background: '#D72531' }} />
          <div
            style={{
              display: 'flex',
              fontSize: 26,
              fontWeight: 400,
              letterSpacing: 6,
              color: '#D72531',
            }}
          >
            {`${STORE.city.toUpperCase()}, ${STORE.state} • MOTOS E CARROS`}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              fontFamily: 'Display',
              fontSize: 128,
              lineHeight: 0.92,
              letterSpacing: -4,
            }}
          >
            LIBERATO
          </div>
          <div
            style={{
              display: 'flex',
              fontFamily: 'Display',
              fontSize: 128,
              lineHeight: 0.92,
              letterSpacing: -4,
              color: '#D72531',
            }}
          >
            MOTOS CAR
          </div>
          <div style={{ display: 'flex', marginTop: 28, fontSize: 32, color: '#C9CDD4' }}>
            {`${STORE.tagline} • ${motos} motos e ${carros} carros anunciados`}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            paddingTop: 30,
            borderTop: '1px solid rgba(255,255,255,0.16)',
            fontSize: 26,
            color: '#9BA1AA',
          }}
        >
          <div style={{ display: 'flex' }}>{STORE_ADDRESS_LINE}</div>
          <div style={{ display: 'flex', color: '#F7F7F4' }}>{STORE.phoneDisplay}</div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
