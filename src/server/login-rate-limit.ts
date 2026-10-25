const WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 30;

export function createLoginLimiter(maxAttempts = MAX_ATTEMPTS, windowMs = WINDOW_MS) {
  let windowStartedAt: number | null = null;
  let count = 0;

  return (now = Date.now()): { allowed: boolean; retryAfterSeconds: number } => {
    if (windowStartedAt === null || now >= windowStartedAt + windowMs || now < windowStartedAt) {
      windowStartedAt = now;
      count = 0;
    }
    if (count >= maxAttempts) {
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((windowStartedAt + windowMs - now) / 1000)) };
    }
    count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
  };
}

// Share the counter between route-handler and Server Action bundles in one Node process.
// A distributed limiter is required before scaling out.
const globalLimiter = globalThis as typeof globalThis & { __liberatoLoginLimiter?: ReturnType<typeof createLoginLimiter> };
export const consumeLoginAttempt = globalLimiter.__liberatoLoginLimiter ??= createLoginLimiter();
