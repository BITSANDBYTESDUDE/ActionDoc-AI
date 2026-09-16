import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { z } from 'zod';
import { connectToDatabase } from '@/lib/db/connect';
import { User } from '@/models/User';
import { verifyPassword } from '@/lib/auth/password';
import { authConfig } from '@/lib/auth/auth.config';
import { enforceRateLimit } from '@/lib/rate-limit';

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(rawCredentials) {
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;

        const email = parsed.data.email.toLowerCase().trim();

        // Throttle credential stuffing per email address.
        await enforceRateLimit({ key: `login:${email}`, limit: 10, windowSeconds: 300 });

        await connectToDatabase();
        const user = await User.findOne({ email }).select('+passwordHash').lean();
        if (!user || !user.isActive) return null;

        const valid = await verifyPassword(parsed.data.password, user.passwordHash ?? '');
        if (!valid) return null;

        await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });

        return {
          id: String(user._id),
          email: user.email,
          name: user.name,
          image: user.image ?? null,
        };
      },
    }),
  ],
});
