import { siteChatAccess } from '@/app/api/atendimento/route';
import { SiteChatWidget } from './SiteChatWidget';

export function SiteAttendance() {
  const access = siteChatAccess();
  if (access === 'off') return null;
  return <SiteChatWidget access={access} />;
}

