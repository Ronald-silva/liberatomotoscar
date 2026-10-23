import type { Attribution } from '@/lib/attribution';

type MetaEventName = 'ViewContent' | 'Contact' | 'Lead';
type GoogleEventName = 'view_item' | 'whatsapp_click' | 'generate_lead';

type BrowserWindow = Window & {
  fbq?: (...args: unknown[]) => void;
  gtag?: (...args: unknown[]) => void;
  __liberatoAnalyticsLoaded?: boolean;
};

export function isAnalyticsReady(): boolean {
  return typeof window !== 'undefined' &&
    Boolean((window as BrowserWindow).__liberatoAnalyticsLoaded);
}

function track(
  metaEvent: MetaEventName,
  googleEvent: GoogleEventName,
  metaDetails: Record<string, unknown>,
  googleDetails: Record<string, unknown>,
): void {
  if (!isAnalyticsReady()) return;
  const browser = window as BrowserWindow;
  browser.fbq?.('track', metaEvent, metaDetails);
  browser.gtag?.('event', googleEvent, googleDetails);
}

export function trackPageView(pathname: string): void {
  if (!isAnalyticsReady()) return;
  const browser = window as BrowserWindow;
  browser.fbq?.('track', 'PageView');
  browser.gtag?.('event', 'page_view', { page_path: pathname });
}

export function trackVehicleView(slug: string, category: string, attribution: Attribution): void {
  track(
    'ViewContent',
    'view_item',
    { content_ids: [slug], content_category: 'vitrine_ilustrativa', ...attribution },
    { items: [{ item_id: slug, item_name: slug, item_category: category }], ...attribution },
  );
}

export function trackWhatsAppClick(
  subject: string,
  placement: string,
  attribution: Attribution,
): void {
  track(
    'Contact',
    'whatsapp_click',
    { content_name: subject, placement, ...attribution },
    { content_name: subject, placement, ...attribution },
  );
}

/** Chamar somente após confirmação de uma conversa recebida como lead. */
export function trackConfirmedLead(reference: string): void {
  track('Lead', 'generate_lead', { lead_source: reference }, { lead_source: reference });
}
