import { PrismaClient, Prisma } from '@prisma/client';
import { BuildSpec } from '../ai/schema';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();
const CONTEXT_TTL_HOURS = 24;

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export const createSession = async (): Promise<string> => {
  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + CONTEXT_TTL_HOURS * 60 * 60 * 1000);

  await prisma.conversationContext.create({
    data: { sessionId, expiresAt, messages: [] },
  });

  return sessionId;
};

export const getContext = async (sessionId: string) => {
  const ctx = await prisma.conversationContext.findUnique({ where: { sessionId } });
  if (!ctx || ctx.expiresAt < new Date()) return null;
  return {
    sessionId: ctx.sessionId,
    messages: ctx.messages as unknown as Message[],
    buildSpec: ctx.buildSpec as BuildSpec | null,
  };
};

export const addMessage = async (sessionId: string, role: 'user' | 'assistant', content: string) => {
  const ctx = await prisma.conversationContext.findUnique({ where: { sessionId } });
  if (!ctx) return null;

  const messages = (ctx.messages as unknown as Message[]) || [];
  messages.push({ role, content, timestamp: new Date().toISOString() });

  // Keep last 20 messages
  const trimmed = messages.slice(-20);

  await prisma.conversationContext.update({
    where: { sessionId },
    data: { messages: trimmed as unknown as Prisma.InputJsonValue },
  });

  return trimmed;
};

export const updateBuildSpec = async (sessionId: string, spec: BuildSpec) => {
  await prisma.conversationContext.update({
    where: { sessionId },
    data: { buildSpec: spec as unknown as Prisma.InputJsonValue },
  });
};

export const deleteSession = async (sessionId: string) => {
  await prisma.conversationContext.delete({ where: { sessionId } }).catch(() => {});
};

export const cleanupExpiredSessions = async () => {
  const result = await prisma.conversationContext.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return result.count;
};
