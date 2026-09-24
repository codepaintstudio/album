import bcrypt from 'bcryptjs';
import type { NextAuthOptions } from 'next-auth';
import { getServerSession } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { cache } from 'react';

import { prisma } from './db';
import { LOGIN_FEEDBACK_TEXT } from './login-feedback';

export const authOptions: NextAuthOptions = {
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/login',
  },
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { username: credentials.username },
        });

        if (!user) {
          return null;
        }

        const isValid = await bcrypt.compare(credentials.password, user.password);
        if (!isValid) {
          return null;
        }

        // 检查账户状态。文案取自 lib/login-feedback.ts：抛出的是散文、匹配回的也是
        // 散文，两处各写一遍时改文案会静默把某个分支降级成"用户名或密码错误"。
        if (user.status === 'pending') {
          throw new Error(LOGIN_FEEDBACK_TEXT.pending);
        }

        if (user.status === 'rejected') {
          throw new Error(LOGIN_FEEDBACK_TEXT.rejected);
        }

        return {
          id: String(user.id),
          name: user.username,
          role: user.role,
        } satisfies {
          id: string;
          name: string;
          role: string;
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as { role: string }).role;
      } else if (!token.role && token.sub) {
        const dbUser = await prisma.user.findUnique({
          where: { id: Number(token.sub) },
          select: { role: true },
        });
        if (dbUser) {
          token.role = dbUser.role;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
        session.user.role = (token.role as string | undefined) ?? 'member';
        session.user.name = token.name ?? session.user.name;
      }
      return session;
    },
  },
};

export const auth = cache(() => getServerSession(authOptions));
