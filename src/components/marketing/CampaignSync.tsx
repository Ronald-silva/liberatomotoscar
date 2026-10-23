'use client';

import { useEffect } from 'react';
import { getCampaignAttribution } from '@/lib/attribution';

export function CampaignSync() {
  useEffect(() => {
    getCampaignAttribution();
  }, []);

  return null;
}
