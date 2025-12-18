// app/api/register-chainhooks/route.ts
import { ChainhooksClient, CHAINHOOKS_BASE_URL } from '@hirosystems/chainhooks-client';
import { NextResponse } from 'next/server';

const HIRO_API_KEY = process.env.HIRO_API_KEY;

if (!HIRO_API_KEY) {
  throw new Error('HIRO_API_KEY is required in .env.local');
}

const client = new ChainhooksClient({
  baseUrl: CHAINHOOKS_BASE_URL.testnet, // Change to .mainnet when ready
  apiKey: HIRO_API_KEY,
});

export async function POST() {
  try {
    // Optional: Clean up old tycoon hooks
    const existing = await client.getChainhooks();
    for (const hook of existing.results) {
      if (hook.definition.name.startsWith('tycoon-')) {
        await client.deleteChainhook(hook.uuid);
      }
    }

    // Register hooks
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

    return NextResponse.json({ success: true, message: 'Chainhooks registered successfully!' });
  } catch (error: any) {
    console.error('Chainhook registration failed:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}