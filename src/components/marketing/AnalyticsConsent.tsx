'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { trackPageView } from '@/lib/analytics';

const META_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;
const GOOGLE_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
const CONSENT_KEY = 'liberato_analytics_consent';

function subscribeConsent(callback: () => void) {
  window.addEventListener('storage', callback);
  window.addEventListener('liberato:consent-change', callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener('liberato:consent-change', callback);
  };
}

function readConsent(): 'accepted' | 'rejected' | null {
  try {
    const saved = window.localStorage.getItem(CONSENT_KEY);
    return saved === 'accepted' || saved === 'rejected' ? saved : null;
  } catch {
    return null;
  }
}

type AnalyticsWindow = Window & {
  fbq?: ((...args: unknown[]) => void) & { queue?: unknown[][] };
  gtag?: (...args: unknown[]) => void;
  dataLayer?: unknown[][];
  __liberatoAnalyticsLoaded?: boolean;
};

function initializeAnalytics() {
  const browser = window as AnalyticsWindow;
  if (browser.__liberatoAnalyticsLoaded) return;
  browser.__liberatoAnalyticsLoaded = true;

  if (META_ID) {
    const fbq = ((...args: unknown[]) => {
      fbq.queue?.push(args);
    }) as NonNullable<AnalyticsWindow['fbq']>;
    fbq.queue = [];
    browser.fbq = fbq;
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(script);
    browser.fbq('init', META_ID);
    browser.fbq('track', 'PageView');
  }

  if (GOOGLE_ID) {
    browser.dataLayer = browser.dataLayer ?? [];
    browser.gtag = (...args: unknown[]) => {
      browser.dataLayer?.push(args);
    };
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GOOGLE_ID)}`;
    document.head.appendChild(script);
    browser.gtag('js', new Date());
    browser.gtag('config', GOOGLE_ID);
  }

  window.dispatchEvent(new Event('liberato:analytics-ready'));
}

export function AnalyticsConsent() {
  const choice = useSyncExternalStore(subscribeConsent, readConsent, () => null);
  const enabled = Boolean(META_ID || GOOGLE_ID);
  const pathname = usePathname();
  const previousPathname = useRef(pathname);

  useEffect(() => {
    if (enabled && choice === 'accepted') initializeAnalytics();
  }, [enabled, choice]);

  useEffect(() => {
    if (pathname !== previousPathname.current) {
      previousPathname.current = pathname;
      if (choice === 'accepted') trackPageView(pathname);
    }
  }, [pathname, choice]);

  function choose(value: 'accepted' | 'rejected') {
    try { window.localStorage.setItem(CONSENT_KEY, value); } catch { /* opcional */ }
    window.dispatchEvent(new Event('liberato:consent-change'));
    if (value === 'accepted') initializeAnalytics();
  }

  if (!enabled || choice) return null;

  return (
    <aside className="consent-banner" aria-label="Preferências de medição">
      <p>Podemos medir visitas e contatos para entender o desempenho das campanhas. Você escolhe se aceita essa medição.</p>
      <div className="consent-actions">
        <button type="button" onClick={() => choose('rejected')}>Recusar</button>
        <button type="button" onClick={() => choose('accepted')}>Aceitar</button>
      </div>
    </aside>
  );
}
