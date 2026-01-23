"use client";

import React, { useState } from "react";
import { FaUser, FaBrain, FaCoins, FaRobot } from "react-icons/fa6";
import { FaRandom } from "react-icons/fa";
import { House } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/game-switch";
import { RiAuctionFill } from "react-icons/ri";
import { GiPrisoner, GiBank } from "react-icons/gi";
import { IoBuild } from "react-icons/io5";
import { useRouter } from "next/navigation";
import { toast } from "react-toastify";
import { generateGameCode } from "@/lib/utils/games";
import { GamePieces } from "@/lib/constants/games";
import { apiClient } from "@/lib/api";
import { useStacks } from "@/hooks/use-stacks";
import { ClarityValue, TupleCV, UIntCV } from "@stacks/transactions";

export default function PlayWithAI() {
  const {
    checkIfRegistered,
    tycoonUser,
    handleCreateAiGame,
    userData,
    handleGetGameByCode,
  } = useStacks();

  const address = userData?.addresses?.stx?.[0]?.address;
  const router = useRouter();

const ai_address = [
  "0xA1FF1c93600c3487FABBdAF21B1A360630f8bac6",
  "0xB2EE17D003e63985f3648f6c1d213BE86B474B11",
  "0xC3FF882E779aCbc112165fa1E7fFC093e9353B21",
  "0xD4FFDE5296C3EE6992bAf871418CC3BE84C99C32",
  "0xE5FF75Fcf243C4cE05B9F3dc5Aeb9F901AA361D1",
  "0xF6FF469692a259eD5920C15A78640571ee845E8",
  "0xA7FFE1f969Fa6029Ff2246e79B6A623A665cE69",
  "0xB8FF2cEaCBb67DbB5bc14D570E7BbF339cE240F6",
];


  const username = tycoonUser?.username ?? "";
  const gameCode = generateGameCode();

  const [settings, setSettings] = useState({
    symbol: 1,
    aiCount: 1,
    startingCash: 1500,
    aiDifficulty: "boss" as "easy" | "medium" | "hard" | "boss",
    auction: true,
    rentInPrison: false,
    mortgage: true,
    evenBuild: true,
    randomPlayOrder: true,
  });

  // --- FIXED TYPE ---
  type SaveGameResponse = {
    success: boolean;
    message: string;
    data: {
      id: number;
    };
  };

const handlePlay = async () => {
  if (!address || !username || !checkIfRegistered) {
    toast.error("Connect wallet & register first");
    return;
  }

  const toastId = toast.loading(
    `Summoning ${settings.aiCount} AI rival${settings.aiCount > 1 ? "s" : ""}...`
  );

  try {
    // CREATE ON-CHAIN
    await handleCreateAiGame(
      username,
      settings.aiCount,
      settings.symbol,
      settings.aiCount,
      gameCode,
      settings.startingCash
    );

    // Add 3-second delay
    await new Promise(resolve => setTimeout(resolve, 5000));

    const onChainGameId: ClarityValue | null = await handleGetGameByCode(gameCode);

    if (!onChainGameId) throw new Error("On-chain game failed");

    const tuple = onChainGameId as TupleCV;

    // Access your id safely with proper type casting
    const gameId = ((tuple.value as { id: UIntCV }).id).value; // Assuming tuple.value is an object with 'id' as UIntCV

    toast.update(toastId, { render: "Saving arena..." });

    // SAVE TO BACKEND
    const saveRes = await apiClient.post<SaveGameResponse>("/games", {
      id: Number(gameId),
      code: gameCode,
      mode: "PRIVATE",
      address,
      symbol: settings.symbol,
      number_of_players: settings.aiCount + 1,
      ai_opponents: settings.aiCount,
      ai_difficulty: settings.aiDifficulty,
      settings: {
        auction: settings.auction,
        rent_in_prison: settings.rentInPrison,
        mortgage: settings.mortgage,
        even_build: settings.evenBuild,
        starting_cash: settings.startingCash,
        randomize_play_order: settings.randomPlayOrder,
      },
    });

    const dbGameId = saveRes.data?.id ?? saveRes.data;
    if (!dbGameId) throw new Error("Invalid backend response");

    toast.update(toastId, {
      render: "Battle begins!",
      type: "success",
      isLoading: false,
      autoClose: 2000,
    });
    
    const usedSymbols = [settings.symbol];

    for (let i = 0; i < settings.aiCount; i++) {
      try {
        const aiAddress = ai_address[i];    
        const available = GamePieces.filter(p => !usedSymbols.includes(p.value));
        const aiSymbol = available.length > 0
          ? available[Math.floor(Math.random() * available.length)].value
          : 2;  // Consider making this a random valid fallback if "dog" is invalid
        usedSymbols.push(aiSymbol);

        await apiClient.post("/game-players/join", {
          address: aiAddress,
          symbol: aiSymbol,
          code: gameCode,
        });
      } catch (innerErr: unknown) {
        let errorMessage = "Unknown error";
        if (innerErr instanceof Error) {
          errorMessage = innerErr.message;
        }
        toast.error(`Failed to create AI player ${i + 1}: ${errorMessage}`);
        throw innerErr; 
      }
    }

    await apiClient.put(`/games/${dbGameId}`, { status: "RUNNING" });

    localStorage.setItem("gameCode", gameCode);
    
    router.push(`/ai-play?gameCode=${gameCode}`);

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Failed";
    toast.update(toastId, {
      render: `Error: ${errorMessage}`,
      type: "error",
      isLoading: false,
      autoClose: 4000,
    });
  }
};

  return (
    <div className="min-h-screen bg-settings bg-cover bg-fixed flex items-center justify-center p-4">
      <div className="w-full max-w-4xl bg-black/60 backdrop-blur-xl rounded-2xl border border-cyan-500/50 shadow-2xl p-8">

        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <button
            onClick={() => router.push("/")}
            className="flex items-center gap-2 text-cyan-400 hover:text-cyan-300 transition"
          >
            <House className="w-5 h-5" />
            <span className="font-medium">BACK</span>
          </button>

          <h1 className="text-5xl font-orbitron font-bold bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent">
            AI DUEL
          </h1>

          <div className="w-24" />
        </div>

        {/* Main Grid */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">

          {/* LEFT SIDE */}
          <div className="space-y-5">

            {/* Your Piece */}
            <div className="p-5 rounded-xl border border-cyan-500/30 bg-gradient-to-br from-cyan-900/50 to-blue-900/50">
              <div className="flex items-center gap-3 mb-3">
                <FaUser className="w-6 h-6 text-cyan-400" />
                <h3 className="text-xl text-cyan-300 font-bold">Your Piece</h3>
              </div>

              <Select
                value={String(settings.symbol)}
                onValueChange={(v) => setSettings((s) => ({ ...s, symbol: Number(v) }))}
              >
                <SelectTrigger className="h-12 bg-black/40 border-cyan-500/50 text-white">
                  <SelectValue placeholder="Select Piece" />
                </SelectTrigger>
                <SelectContent>
                  {GamePieces.map((p) => (
                    <SelectItem key={p.id} value={String(p.value)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* AI Count */}
            <div className="p-5 rounded-xl border border-purple-500/30 bg-gradient-to-br from-purple-900/50 to-pink-900/50">
              <div className="flex items-center gap-3 mb-3">
                <FaRobot className="w-6 h-6 text-purple-400" />
                <h3 className="text-xl text-purple-300 font-bold">AI Count</h3>
              </div>

              <Select
                value={String(settings.aiCount)}
                onValueChange={(v) => setSettings((s) => ({ ...s, aiCount: Number(v) }))}
              >
                <SelectTrigger className="h-12 bg-black/40 border-purple-500/50 text-white">
                  <SelectValue placeholder="Select AI Count" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 AI</SelectItem>
                  <SelectItem value="2">2 AI</SelectItem>
                  <SelectItem value="3">3 AI</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Difficulty */}
            <div className="p-5 rounded-xl border border-red-500/30 bg-gradient-to-br from-red-900/50 to-orange-900/50">
              <div className="flex items-center gap-3 mb-3">
                <FaBrain className="w-6 h-6 text-red-400" />
                <h3 className="text-xl text-red-300 font-bold">Difficulty</h3>
              </div>

              <Select
                value={settings.aiDifficulty}
                onValueChange={(v) =>
                  setSettings((s) => ({ ...s, aiDifficulty: v as "easy" | "medium" | "hard" | "boss" }))
                }
              >
                <SelectTrigger className="h-12 bg-black/40 border-red-500/50 text-white">
                  <SelectValue placeholder="Difficulty" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="easy">Easy</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="hard">Hard</SelectItem>
                  <SelectItem value="boss">Boss Mode</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Starting Cash */}
            <div className="p-5 rounded-xl border border-yellow-500/30 bg-gradient-to-br from-yellow-900/50 to-amber-900/50">
              <div className="flex items-center gap-3 mb-3">
                <FaCoins className="w-6 h-6 text-yellow-400" />
                <h3 className="text-xl text-yellow-300 font-bold">Starting Cash</h3>
              </div>

              <Select
                value={String(settings.startingCash)}
                onValueChange={(v) =>
                  setSettings((s) => ({ ...s, startingCash: Number(v) }))
                }
              >
                <SelectTrigger className="h-12 bg-black/40 border-yellow-500/50 text-white">
                  <SelectValue placeholder="Select Cash" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="500">$500</SelectItem>
                  <SelectItem value="1000">$1,000</SelectItem>
                  <SelectItem value="1500">$1,500</SelectItem>
                  <SelectItem value="2000">$2,000</SelectItem>
                  <SelectItem value="5000">$5,000</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* RIGHT SIDE — RULES */}
          <div className="bg-black/70 rounded-xl p-6 border border-cyan-500/40">
            <h3 className="text-2xl font-orbitron font-bold text-cyan-300 mb-5 text-center">
              HOUSE RULES
            </h3>

            <div className="space-y-4">
              {[
                { icon: RiAuctionFill, label: "Auction", key: "auction" as const },
                { icon: GiPrisoner, label: "Rent in Jail", key: "rentInPrison" as const },
                { icon: GiBank, label: "Mortgage", key: "mortgage" as const },
                { icon: IoBuild, label: "Even Build", key: "evenBuild" as const },
                { icon: FaRandom, label: "Random Order", key: "randomPlayOrder" as const },
              ].map((r) => {
                const Icon = r.icon;
                return (
                  <div key={r.key} className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <Icon className="w-6 h-6 text-cyan-400" />
                      <span className="text-white text-lg">{r.label}</span>
                    </div>

                    <Switch
                      checked={settings[r.key]}
                      onCheckedChange={(v) =>
                        setSettings((s) => ({ ...s, [r.key]: v }))
                      }
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* PLAY BUTTON */}
        <div className="flex justify-center mt-8">
          <button
            onClick={handlePlay}
            className="px-16 py-5 text-2xl font-orbitron font-bold tracking-wider
                       bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-purple-600 hover:to-pink-600
                       rounded-xl shadow-xl transform hover:scale-105 transition-all duration-300
                       border-4 border-cyan-400/80 relative overflow-hidden"
          >
            START BATTLE
          </button>
        </div>
      </div>
    </div>
  );
}