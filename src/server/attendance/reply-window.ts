const DAY_MS = 24 * 60 * 60 * 1000;

export function replyWindowState(lastVisitorMessageAt: Date | null, now: Date): 'open' | 'closed' | 'unknown' {
  if (!lastVisitorMessageAt) return 'unknown';
  const elapsed = now.getTime() - lastVisitorMessageAt.getTime();
  return elapsed >= 0 && elapsed < DAY_MS ? 'open' : 'closed';
}
