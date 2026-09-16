import type { NextAuthConfig } from 'next-auth';

/**
 * Edge-safe Auth.js configuration.
 *
 * This half contains no database or Node-only imports so it can be consumed by
 * `middleware.ts` running on the edge runtime. The credentials provider (which
 * needs Mongoose) is added in `src/lib/auth/index.ts`.
 */
export const authConfig = {
  trustHost: true,
  secret: process.env.AUTH_SECRET,
  session: {
    strategy: 'jwt',
    maxAge: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.sub = user.id ?? token.sub;
        token.email = user.email ?? token.email;
        token.name = user.name ?? token.name;
        token.picture = user.image ?? null;
      }
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      if (token.email) session.user.email = token.email;
      if (token.name) session.user.name = token.name;
      session.user.image = (token.picture as string | null) ?? null;
      return session;
    },
  },
} satisfies NextAuthConfig;