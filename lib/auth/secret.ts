export function getAuthSecret(): string {
  const authSecret = process.env.AUTH_SECRET;
  const nextAuthSecret = process.env.NEXTAUTH_SECRET;

  if (authSecret && nextAuthSecret && authSecret !== nextAuthSecret) {
    throw new Error('AUTH_SECRET and NEXTAUTH_SECRET must contain the same stable value.');
  }

  const secret = authSecret || nextAuthSecret;

  if (!secret || secret.length < 32) {
    throw new Error('Set a stable AUTH_SECRET of at least 32 characters in .env.local.');
  }

  return secret;
}