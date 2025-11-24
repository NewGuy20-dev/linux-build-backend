import { Router } from 'express';
import buildRoutes from './build.routes';
import prisma from '../db/client';

const router = Router();

router.get('/health', async (req, res) => {
  try {
    await prisma.$connect();
    res.status(200).json({ status: 'ok', db: 'connected' });
  } catch (error) {
    res.status(500).json({ status: 'error', db: 'disconnected' });
  } finally {
    await prisma.$disconnect();
  }
});

router.use(buildRoutes);

export default router;
