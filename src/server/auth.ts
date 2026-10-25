import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { getDb } from '@/server/db/client';
import { accountsTable, authenticatorsTable, sessionsTable, usersTable, verificationTokensTable } from '@/server/db/schema';
import { getAuthSecret } from '@/server/env';
import { isAdminAuthConfigured, isAllowedGoogleProfile } from '@/server/auth-policy';

// Without all server-side settings there is no sign-in provider. No public signup is offered.
let instance: ReturnType<typeof NextAuth> | undefined;
export function getAuth() {
  const configured = isAdminAuthConfigured();
  return instance ??= NextAuth({
    adapter: DrizzleAdapter(getDb(), { usersTable, accountsTable, sessionsTable, verificationTokensTable, authenticatorsTable }),
    providers: configured ? [Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    })] : [],
    session: { strategy: 'database', maxAge: 60 * 60 * 12 },
    callbacks: {
      signIn({ account, profile }) {
        return configured && isAllowedGoogleProfile(account?.provider, profile);
      },
      session({ session, user }) {
        if (session.user) session.user.id = user.id;
        return session;
      },
    },
    secret: getAuthSecret(),
    trustHost: process.env.AUTH_TRUST_HOST === 'true',
    pages: { signIn: '/admin/login', error: '/admin/login' },
  });
}
