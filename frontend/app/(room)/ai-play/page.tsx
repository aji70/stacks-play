"use client";

import AiBoard from "@/components/game/ai-board";
import GameRoom from "@/components/game/game-room";
import GamePlayers from "@/components/game/ai-player";
import MobileGameLayout from "@/components/game/MobileGameLayout";
import MobilePlayerLayout from "@/components/game/MobilePlayerLayout";

import { apiClient } from "@/lib/api";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Game, GameProperty, Player, Property } from "@/types/game";
import { useStacks } from "@/hooks/use-stacks";
import { useQuery } from "@tanstack/react-query";
import { ApiResponse } from "@/types/api";
import { useMediaQuery } from "@/components/useMediaQuery";

export default function GamePlayPage() {
  const searchParams = useSearchParams();
  const [gameCode, setGameCode] = useState<string>("");

  const isMobile = useMediaQuery("(max-width: 768px)");

  const { userData } = useStacks();
  const address = userData?.addresses?.stx?.[0]?.address;

  useEffect(() => {
    const code = searchParams.get("gameCode") || localStorage.getItem("gameCode");

    if (code && code.length === 6 && code !== gameCode) {
      setTimeout(() => setGameCode(code), 0);
      localStorage.setItem("gameCode", code);
    }
  }, [searchParams, gameCode]);

  const {
    data: game,
    isLoading: gameLoading,
    isError: gameError,
  } = useQuery<Game | null>({
    queryKey: ["game", gameCode],
    queryFn: async () => {
      if (!gameCode) return null;
      const res = await apiClient.get<ApiResponse<Game>>(`/games/code/${gameCode}`);
      if (!res?.success || !res.data) return null;
      return res.data;
    },
    enabled: !!gameCode,
    refetchInterval: 5000,
  });

  const me = useMemo(() => {
    if (!game?.players || !address) return null;
    return (
      game.players.find(
        (pl: Player) => pl.address?.toLowerCase() === address.toLowerCase()
      ) || null
    );
  }, [game, address]);

  const {
    data: properties = [],
    isLoading: propertiesLoading,
  } = useQuery<Property[]>({
    queryKey: ["properties"],
    queryFn: async (): Promise<Property[]> => {
      const res = await apiClient.get<ApiResponse<Property[]>>("/properties");
      return res?.success && res.data ? res.data : [];
    },
  });

  const {
    data: game_properties = [],
    isLoading: gamePropertiesLoading,
  } = useQuery<GameProperty[]>({
    queryKey: ["game_properties", game?.id],
    queryFn: async (): Promise<GameProperty[]> => {
      if (!game?.id) return [];
      const res = await apiClient.get<ApiResponse<GameProperty[]>>(
        `/game-properties/game/${game.id}`
      );
      return res?.success && res.data ? res.data : [];
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

  const [activeTab, setActiveTab] = useState<"board" | "players">("board");

  if (gameLoading || propertiesLoading) {
    return (
      <div className="w-full h-screen bg-[#010F10] flex flex-col items-center justify-center gap-6 text-cyan-300">
        <div className="w-16 h-16 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-2xl font-bold tracking-wider">Loading Game...</p>
      </div>
    );
  }

  if (gameError || !game) {
    return (
      <div className="w-full h-screen bg-[#010F10] flex flex-col items-center justify-center text-center px-8">
        <h2 className="text-3xl font-bold text-red-400 mb-4">Game Not Found</h2>
        <p className="text-gray-300 text-lg">
          Invalid or expired game code. Please check and try again.
        </p>
      </div>
    );
  }

  // Mobile View
  if (isMobile) {
    return (
      <main className="w-full h-screen flex flex-col overflow-hidden bg-[#010F10]">
        {/* Main Content */}
        <div className="flex-1 w-full overflow-hidden">
          {activeTab === "board" ? (
            <MobileGameLayout
              game={game}
              properties={properties}
              game_properties={game_properties}
              me={me}
            />
          ) : (
            <MobilePlayerLayout
              game={game}
              properties={properties}
              game_properties={game_properties}
              my_properties={my_properties}
              me={me}
            />
          )}
        </div>

        {/* Cool Animated Bottom Tab Bar with Emojis */}
<nav className="fixed bottom-0 left-0 right-0 h-20 pb-safe bg-gradient-to-t from-[#010F10]/95 to-[#010F10]/80 backdrop-blur-xl border-t-2 border-cyan-500/50 flex items-center justify-around z-50 shadow-2xl">
  <button
    onClick={() => setActiveTab("board")}
    className={`flex flex-col items-center justify-center flex-1 h-full transition-all duration-300 ${
      activeTab === "board"
        ? "text-cyan-300 scale-110 drop-shadow-lg"
        : "text-gray-500 scale-100"
    }`}
  >
    <span className="text-4xl mb-1">🎲</span>
    <span className="text-xs font-bold tracking-wider">Board</span>
  </button>

  <button
    onClick={() => setActiveTab("players")}
    className={`flex flex-col items-center justify-center flex-1 h-full transition-all duration-300 ${
      activeTab === "players"
        ? "text-cyan-300 scale-110 drop-shadow-lg"
        : "text-gray-500 scale-100"
    }`}
  >
    <span className="text-4xl mb-1">👥</span>
    <span className="text-xs font-bold tracking-wider">Players</span>
  </button>
</nav>
      </main>
    );
  }

  // Desktop View
  return (
    <main className="w-full h-screen overflow-hidden relative flex flex-row bg-[#010F10] lg:gap-4 p-4">
      <div className="hidden lg:block w-80 flex-shrink-0">
        <GamePlayers
          game={game}
          properties={properties}
          game_properties={game_properties}
          my_properties={my_properties}
          me={me}
        />
      </div>

      <div className="flex-1 min-w-0">
        <AiBoard
          game={game}
          properties={properties}
          game_properties={game_properties}
          me={me}
        />
      </div>

      <div className="hidden lg:block w-80 flex-shrink-0">
        <GameRoom />
      </div>
    </main>
  );
}