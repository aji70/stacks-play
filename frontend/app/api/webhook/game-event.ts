// pages/api/webhook/game-event.ts
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const payload = req.body;

  // Simple security: check if it's really from Hiro
  // Optional: verify signature in production

  console.log('Chainhook event received:', payload);

  // Here you can:
  // - Update a database
  // - Invalidate Next.js cache (revalidatePath)
  // - Send WebSocket message to clients
  // - Trigger notifications

  // For now, just acknowledge
  res.status(200).json({ received: true });
}