'use client';

import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { buildWhatsAppUrl, getCampaignAttribution } from '@/lib/attribution';
import { trackWhatsAppClick } from '@/lib/analytics';

interface WhatsAppLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  subject: string;
  placement: string;
  children: ReactNode;
  showArrow?: boolean;
}

export function WhatsAppLink({
  subject,
  placement,
  children,
  showArrow = false,
  ...props
}: WhatsAppLinkProps) {
  return (
    <a
      {...props}
      href={buildWhatsAppUrl(subject)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(event) => {
        const attribution = getCampaignAttribution();
        event.currentTarget.href = buildWhatsAppUrl(subject, attribution);
        trackWhatsAppClick(subject, placement, attribution);
        props.onClick?.(event);
      }}
    >
      {children}
      {showArrow && <ArrowUpRight aria-hidden="true" size={17} strokeWidth={2} />}
    </a>
  );
}
