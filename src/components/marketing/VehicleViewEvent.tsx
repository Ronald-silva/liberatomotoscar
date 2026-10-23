'use client';

import { useEffect } from 'react';
import { isAnalyticsReady, trackVehicleView } from '@/lib/analytics';
import { getCampaignAttribution } from '@/lib/attribution';

export function VehicleViewEvent({
  slug,
  category,
}: {
  slug: string;
  category: string;
}) {
  useEffect(() => {
    let sent = false;
    const sendWhenReady = () => {
      if (sent || !isAnalyticsReady()) return;
      trackVehicleView(slug, category, getCampaignAttribution());
      sent = true;
    };
    sendWhenReady();
    window.addEventListener('liberato:analytics-ready', sendWhenReady);
    return () => window.removeEventListener('liberato:analytics-ready', sendWhenReady);
  }, [slug, category]);

  return null;
}
