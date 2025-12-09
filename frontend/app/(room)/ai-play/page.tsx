"use client";

import AiBoard from "@/components/game/ai-board";
import GameRoom from "@/components/game/game-room";
import GamePlayers from "@/components/game/ai-player";
import { apiClient } from "@/lib/api";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Game, GameProperty, Player, Property } from "@/types/game";
import { useStacks } from "@/hooks/use-stacks";
import { useQuery } from "@tanstack/react-query";
import { ApiResponse } from "@/types/api";

export default function GamePlayPage() {
  const searchParams = useSearchParams();
  const [gameCode, setGameCode] = useState<string>("");

  const { userData } = useStacks();
  const address = userData?.addresses?.stx?.[0]?.address;
  
useEffect(() => {
  const code = searchParams.get("gameCode") || localStorage.getItem("gameCode");

  if (code && code.length === 6 && code !== gameCode) {
    setTimeout(() => setGameCode(code), 0); // safe async state update
  }
}, [searchParams, gameCode]);

const {
  data: game,
  isLoading: gameLoading,
  isError: gameError,
} = useQuery<Game>({
  queryKey: ["game", gameCode],
  queryFn: async () => {
    console.log("FETCHING GAME WITH CODE:", gameCode);

    const res = await apiClient.get<ApiResponse>(`/games/code/${gameCode}`);

    console.log("GAME RAW RESPONSE:", res.data);


    if (!res?.success) {
      console.log("GAME LOAD FAILED");
      return null;
    }

    console.log("GAME PARSED DATA:", res.data);
    console.log("GAME error:", gameError);

    return res.data;
  },
  enabled: !!gameCode,
  refetchInterval: 5000,
});


  const me = useMemo(() => {
    if (!game?.players || !address) return null;
    return game.players.find(
      (pl: Player) => pl.address?.toLowerCase() === address.toLowerCase()
    ) || null;
  }, [game, address]);

 const {
  data: properties = [],
  isLoading: propertiesLoading,
} = useQuery<Property[]>({
  queryKey: ["properties"],
  queryFn: async () => {
    const res = await apiClient.get<ApiResponse>("/properties");
    console.log("PROPERTIES RESPONSE:", res);
    return res?.success ? res.data : [];
  }
});


const {
  data: game_properties = [],
  isLoading: gamePropertiesLoading,
} = useQuery<GameProperty[]>({
  queryKey: ["game_properties", game?.id],
  queryFn: async () => {
    if (!game?.id) {
      console.log("NO GAME ID YET");
      return [];
    }

    const res = await apiClient.get<ApiResponse>(
      `/game-properties/game/${game.id}`
    );
    
    console.log("GAME PROPERTIES RESPONSE:", res);
    
    return res.success ? res.data : [];
  },
  enabled: !!game?.id,
  refetchInterval: 15000,
});


  const my_properties: Property[] = useMemo(() => {
    if (!game_properties?.length || !properties?.length || !address) return [];

    const propertyMap = new Map(properties.map((p) => [p.id, p]));

    return game_properties
      .filter((gp) => gp.address?.toLowerCase() === address.toLowerCase())
      .map((gp) => propertyMap.get(gp.property_id))
      .filter((p): p is Property => !!p)
      .sort((a, b) => a.id - b.id);
  }, [game_properties, properties, address]);

  if (gameLoading) {
    return (
      <div className="w-full min-h-screen flex items-center justify-center text-lg font-medium text-white">
        Loading game...
      </div>
    );
  }

  if (gameError) {
    return (
      <div className="w-full min-h-screen flex items-center justify-center text-lg font-medium text-white">
        Failed to load game
      </div>
    );
  }

  console.log("loaded properties: ", properties);


  return game && !propertiesLoading && !gamePropertiesLoading ? (
    <main className="w-full h-screen overflow-x-hidden relative flex flex-row lg:gap-2">
      <GamePlayers
        game={game}
        properties={properties}
        game_properties={game_properties}
        my_properties={my_properties}
        me={me}
      />

      <div className="lg:flex-1 w-full">
        <AiBoard
          game={game}
          properties={properties}
          game_properties={game_properties}
          // my_properties={my_properties}
          me={me}
        />
      </div>
      <GameRoom />
    </main>
  ) : (
    <>
    </>
  );
}
