const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function allowedAdminEmails(): string[] {
  return (process.env.ADMIN_GOOGLE_EMAIL ?? '').split(',').map((entry) => entry.trim().toLowerCase()).filter(Boolean);
}

export function isAdminAuthConfigured(): boolean {
  const emails = allowedAdminEmails();
  return Boolean(
    process.env.AUTH_GOOGLE_ID?.trim() &&
    process.env.AUTH_GOOGLE_SECRET?.trim() &&
    process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 32 &&
    emails.length > 0 && emails.every((email) => EMAIL_PATTERN.test(email)),
  );
}

export function isAllowedGoogleProfile(provider: string | undefined, profile: Record<string, unknown> | undefined): boolean {
  const emails = allowedAdminEmails();
  const actual = typeof profile?.email === 'string' ? profile.email.trim().toLowerCase() : '';
  return provider === 'google' && profile?.email_verified === true && Boolean(actual && emails.includes(actual));
}
