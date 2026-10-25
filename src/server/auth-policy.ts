export function isAdminAuthConfigured(): boolean {
  const email = process.env.ADMIN_GOOGLE_EMAIL?.trim();
  return Boolean(
    process.env.AUTH_GOOGLE_ID?.trim() &&
    process.env.AUTH_GOOGLE_SECRET?.trim() &&
    process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 32 &&
    email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
  );
}

export function isAllowedGoogleProfile(provider: string | undefined, profile: Record<string, unknown> | undefined): boolean {
  const expected = process.env.ADMIN_GOOGLE_EMAIL?.trim().toLowerCase();
  const actual = typeof profile?.email === 'string' ? profile.email.trim().toLowerCase() : '';
  return provider === 'google' && profile?.email_verified === true && Boolean(expected && actual === expected);
}
