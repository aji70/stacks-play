// app/api/register-chainhooks/route.ts
import { ChainhooksClient, CHAINHOOKS_BASE_URL } from '@hirosystems/chainhooks-client';
import { NextResponse } from 'next/server';

const HIRO_API_KEY = process.env.HIRO_API_KEY;

if (!HIRO_API_KEY) {
  throw new Error('HIRO_API_KEY is required in .env.local');
}

const client = new ChainhooksClient({
  baseUrl: CHAINHOOKS_BASE_URL.testnet, // Use .mainnet for production
  apiKey: HIRO_API_KEY,
});

export async function POST() {
  try {
    // Optional: Clean up old tycoon-related chainhooks
    const existing = await client.getChainhooks();
    for (const hook of existing.results) {
      if (hook.definition.name.startsWith('tycoon-')) {
        console.log(`Deleting old chainhook: ${hook.definition.name} (${hook.uuid})`);
        await client.deleteChainhook(hook.uuid);
      }
    }

    // Common action for all hooks
    const action = {
      type: 'http_post' as const,
      url: `${process.env.NEXT_PUBLIC_SITE_URL}/api/webhook/game-event`,
    };

    // Register tycoon-game-created
    await client.registerChainhook({
      name: 'tycoon-game-created',
      version: "1",
      chain: 'stacks',
      network: 'testnet',
      filters: {
        events: [],
      },
      action,
    });

    // Register tycoon-ai-game-created
    await client.registerChainhook({
      name: 'tycoon-ai-game-created',
      version: "1",
      chain: 'stacks',
      network: 'testnet',
      filters: {
        events: [],
      },
      action,
    });

    // Register tycoon-player-joined
    await client.registerChainhook({
      name: 'tycoon-player-joined',
      version: "1",
      chain: 'stacks',
      network: 'testnet',
      filters: {
        events: [],
      },
      action,
    });

    return NextResponse.json({ message: 'Chainhooks registered successfully' });
  } catch (error) {
    console.error('Error registering chainhooks:', error);
    return NextResponse.json({ error: 'Failed to register chainhooks' }, { status: 500 });
  }
}