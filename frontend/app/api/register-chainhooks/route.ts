// pages/api/register-chainhooks.ts
import { ChainhooksClient, CHAINHOOKS_BASE_URL } from '@hirosystems/chainhooks-client';
import type { NextApiRequest, NextApiResponse } from 'next';

const HIRO_API_KEY = process.env.HIRO_API_KEY!; // We'll add this to .env next

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const client = new ChainhooksClient({
    baseUrl: CHAINHOOKS_BASE_URL.testnet, // Change to mainnet later
    apiKey: HIRO_API_KEY,
  });
  

  try {
    // Delete old hooks if any (optional cleanup)
    const existing = await client.getChainhooks();
    for (const hook of existing.results) {
      if (hook.definition.name.startsWith('tycoon-')) {
        await client.deleteChainhook(hook.uuid);
      }
    }

    // 1. Hook: Someone creates a game
    await client.registerChainhook({
      name: 'tycoon-game-created',
      chain: 'stacks',
      network: 'testnet',
      predicate: {
        contract_calls: {
          contract_id: 'SP81CZF1YK81CPAMS6PRS3GJSKK35MGZ2R9SNESA.tyc',
          function_name: 'create-game',
        },
      },
      action: {
        type: 'http-post',
        url: `${process.env.NEXT_PUBLIC_SITE_URL}/api/webhook/game-event`,
      },
    });

    // 2. Hook: Someone creates an AI game
    await client.registerChainhook({
      name: 'tycoon-ai-game-created',
      chain: 'stacks',
      network: 'testnet',
      predicate: {
        contract_calls: {
          contract_id: 'SP81CZF1YK81CPAMS6PRS3GJSKK35MGZ2R9SNESA.tyc',
          function_name: 'create-ai-game',
        },
      },
      action: {
        type: 'http-post',
        url: `${process.env.NEXT_PUBLIC_SITE_URL}/api/webhook/game-event`,
      },
    });

    // 3. Hook: Someone joins a game
    await client.registerChainhook({
      name: 'tycoon-player-joined',
      chain: 'stacks',
      network: 'testnet',
      predicate: {
        contract_calls: {
          contract_id: 'SP81CZF1YK81CPAMS6PRS3GJSKK35MGZ2R9SNESA.tyc',
          function_name: 'join-game',
        },
      },
      action: {
        type: 'http-post',
        url: `${process.env.NEXT_PUBLIC_SITE_URL}/api/webhook/game-event`,
      },
    });

    res.status(200).json({ success: true, message: 'Chainhooks registered!' });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
}