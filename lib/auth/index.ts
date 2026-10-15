import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import UserModel from '@/models/User';
import connectMongo from '@/lib/db/connect';
import { normalizeEmail, verifyPassword } from '@/lib/auth/password';
import { getAuthSecret } from '@/lib/auth/secret';

export const authOptions: NextAuthOptions = {
  secret: getAuthSecret(),
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/login',
  },
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        try {
          await connectMongo();
        } catch {
          return null;
        }

        const email = normalizeEmail(String(credentials.email));
        const user = await UserModel.findOne({ email }).select('+passwordHash').lean();

        if (!user || !user.passwordHash) {
          return null;
        }

        const isValid = await verifyPassword(String(credentials.password), user.passwordHash);

        if (!isValid) {
          return null;
        }

        return {
          id: String(user._id),
          name: user.name,
          email: user.email,
          timezone: user.timezone ?? 'UTC',
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const jwtToken = token as typeof token & { id?: string; timezone?: string | null };
        jwtToken.id = user.id;
        jwtToken.timezone = (user as typeof user & { timezone?: string | null }).timezone ?? 'UTC';
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const sessionUser = session.user as typeof session.user & { id?: string; timezone?: string | null };
        const jwtToken = token as typeof token & { id?: string; timezone?: string | null };

        sessionUser.id = String(jwtToken.id ?? '');
        sessionUser.timezone = String(jwtToken.timezone ?? 'UTC');
      }
      return session;
    },
  },
  cookies: {
    sessionToken: {
      name: '__Secure_lifeos_session',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },
  debug: process.env.NODE_ENV !== 'production',
};
