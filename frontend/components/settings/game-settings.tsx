"use client";

import React, { useState, useEffect } from "react";
import { FaUsers, FaUser, FaCoins } from "react-icons/fa6";
import { House } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/game-switch";
import { MdPrivateConnectivity } from "react-icons/md";
import { RiAuctionFill } from "react-icons/ri";
import { GiBank, GiPrisoner } from "react-icons/gi";
import { IoBuild } from "react-icons/io5";
import { FaHandHoldingDollar } from "react-icons/fa6";
import { FaRandom } from "react-icons/fa";
import { useRouter } from "next/navigation";
import { toast } from "react-toastify";
import { generateGameCode } from "@/lib/utils/games";
import { GamePieces } from "@/lib/constants/games";
import { apiClient } from "@/lib/api";
import { useStacks } from "@/hooks/use-stacks"; 
import { ClarityValue, TupleCV, UIntCV } from "@stacks/transactions";

interface Settings {
  code: string;
  symbol: number;
  maxPlayers: number;
  privateRoom: boolean;
  auction: boolean;
  rentInPrison: boolean;
  mortgage: boolean;
  evenBuild: boolean;
  startingCash: number;
  randomPlayOrder: boolean;
}

type SaveGameResponse = {
  success: boolean;
  message: string;
  data: {
    id: number;
  };
};

export default function Page() {
  const router = useRouter();
  const { userData, tycoonUser, checkIfRegistered, handleCreateGame, handleGetGameByCode } = useStacks();
  const address = userData?.addresses?.stx?.[0]?.address;

  const [settings, setSettings] = useState<Settings>({
    code: generateGameCode(),
    symbol: 1,
    maxPlayers: 2,
    privateRoom: false,
    auction: false,
    rentInPrison: false,
    mortgage: false,
    evenBuild: false,
    startingCash: 1500,
    randomPlayOrder: false,
  });

  // New states for loading/pending
  const [isPending, setIsPending] = useState(false);
  const [isRegisteredLoading, setIsRegisteredLoading] = useState(false); // Start as true if checking on mount
  const [isRegistered, setIsRegistered] = useState(true); // Store the result separately
  const gameCode = settings.code;
  const playerSymbol = settings.symbol;
  const numberOfPlayers = settings.maxPlayers;  

  const handleSettingChange = (
    key: keyof Settings,
    value: Settings[keyof Settings]
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handlePlay = async () => {
    if (!address) {
      toast.error("Please connect your wallet", { position: "top-right", autoClose: 5000 });
      return;
    }

    if (!userData || !userData.addresses?.stx?.length) {
      console.error("User data not available");
      return;
    }

    if (!isRegistered) {
      toast.error("Please register before creating a game", { position: "top-right", autoClose: 5000 });
      router.push("/");
      return;
    }



    setIsPending(true); // Start pending state
    const toastId = toast.loading("Creating game...", { position: "top-right" });

    try {
      const gameType = settings.privateRoom ? 1 : 0;
      await handleCreateGame(gameType, playerSymbol, numberOfPlayers, gameCode, settings.startingCash, 1);

      // Add 3-second delay
      await new Promise(resolve => setTimeout(resolve, 3000));

      const onChainGameId: ClarityValue | null = await handleGetGameByCode(gameCode);

      console.log("On-chain game ID:", onChainGameId);

      if (!onChainGameId) throw new Error("On-chain game failed");

      const tuple = onChainGameId as TupleCV;

      // Access your id safely with proper type casting
      const gameId = ((tuple.value as { id: UIntCV }).id).value; // Assuming tuple.value is an object with 'id' as UIntCV

      toast.update(toastId, { render: "Saving arena..." });

      const saveRes = await apiClient.post<SaveGameResponse>("/games", {
        id: Number(gameId),
        code: gameCode,
        mode: settings.privateRoom ? "PRIVATE" : "PUBLIC",
        address,
        symbol: playerSymbol,
        number_of_players: numberOfPlayers,
        bet_amount: 1,
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
        render: `Game created! Code: ${gameCode}`,
        type: "success",
        isLoading: false,
        autoClose: 2000,
      });

      localStorage.setItem("gameCode", gameCode);

      router.push(`/game-waiting?gameCode=${gameCode}`);
    } catch (err: unknown) {
      console.error("Error creating game:", err);

      const message =
        err instanceof Error ? err.message : "Failed to create game. Please try again.";

      toast.update(toastId, {
        render: message,
        type: "error",
        isLoading: false,
        autoClose: 5000,
      });
    } finally {
      setIsPending(false);
    }
  };

  if (isRegisteredLoading) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-settings bg-cover">
        <p className="text-[#00F0FF] text-3xl font-orbitron animate-pulse">LOADING ARENA...</p>
      </div>
    );
  }

  // If not registered after loading, redirect or show message
  if (!isRegistered) {
    router.push("/"); // Or render a "Not Registered" UI
    return null;
  }

  return (
    <div className="min-h-screen bg-settings bg-cover bg-fixed flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-black/60 backdrop-blur-xl rounded-2xl border border-cyan-500/50 shadow-2xl p-6">

        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <button
            onClick={() => router.push("/")}
            className="flex items-center gap-2 text-cyan-400 hover:text-cyan-300 transition"
          >
            <House className="w-4 h-4" />
            <span className="font-medium text-sm">BACK</span>
          </button>
          <h1 className="text-4xl font-orbitron font-bold bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent">
            CREATE GAME
          </h1>
          <div className="w-20" />
        </div>

        {/* Main Grid */}
        <div className="grid md:grid-cols-2 gap-4 mb-6">

          {/* Left Column – Core Settings */}
          <div className="space-y-4">

            {/* Avatar */}
            <div className="p-4 rounded-xl border border-cyan-500/30 bg-gradient-to-br from-cyan-900/50 to-blue-900/50">
              <div className="flex items-center gap-2 mb-2">
                <FaUser className="w-5 h-5 text-cyan-400" />
                <h3 className="text-lg text-cyan-300 font-bold">Your Piece</h3>
              </div>
              <Select value={String(settings.symbol)} onValueChange={v => handleSettingChange("symbol", Number(v))}>
                <SelectTrigger className="h-10 bg-black/40 border-cyan-500/50 text-white text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GamePieces.map(p => (
                    <SelectItem key={p.id} value={String(p.value)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Max Players */}
            <div className="p-4 rounded-xl border border-purple-500/30 bg-gradient-to-br from-purple-900/50 to-pink-900/50">
              <div className="flex items-center gap-2 mb-2">
                <FaUsers className="w-5 h-5 text-purple-400" />
                <h3 className="text-lg text-purple-300 font-bold">Max Players</h3>
              </div>
              <Select value={String(settings.maxPlayers)} onValueChange={v => handleSettingChange("maxPlayers", Number(v))}>
                <SelectTrigger className="h-10 bg-black/40 border-purple-500/50 text-white text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[2,3,4,5,6,7,8].map(n => (
                    <SelectItem key={n} value={n.toString()}>{n} Players</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Private Room */}
            <div className="p-4 rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-900/50 to-teal-900/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MdPrivateConnectivity className="w-5 h-5 text-emerald-400" />
                  <h3 className="text-lg text-emerald-300 font-bold">Private Room</h3>
                </div>
                <Switch
                  checked={settings.privateRoom}
                  onCheckedChange={v => handleSettingChange("privateRoom", v)}
                />
              </div>
              <p className="text-gray-400 text-xs mt-1">Only joinable via link</p>
            </div>

            {/* Starting Cash */}
            <div className="p-4 rounded-xl border border-yellow-500/30 bg-gradient-to-br from-yellow-900/50 to-amber-900/50">
              <div className="flex items-center gap-2 mb-2">
                <FaHandHoldingDollar className="w-5 h-5 text-yellow-400" />
                <h3 className="text-lg text-yellow-300 font-bold">Starting Cash</h3>
              </div>
              <Select value={String(settings.startingCash)} onValueChange={v => handleSettingChange("startingCash", Number(v))}>
                <SelectTrigger className="h-10 bg-black/40 border-yellow-500/50 text-white text-sm">
                  <SelectValue />
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

            {/* Bet Amount */}
            {/* <div className="p-4 rounded-xl border border-red-500/30 bg-gradient-to-br from-red-900/50 to-orange-900/50">
              <div className="flex items-center gap-2 mb-2">
                <FaCoins className="w-5 h-5 text-red-400" />
                <h3 className="text-lg text-red-300 font-bold">Bet Amount (STX)</h3>
              </div>
              <input
                type="number"
                step="0.01"
                value={displayBetAmount}
                onChange={(e) => setDisplayBetAmount(Number(e.target.value))}
                className="h-10 w-full bg-black/40 border-red-500/50 text-white px-3 rounded-md text-sm"
              />
            </div> */}

          </div>

          {/* Right Column – House Rules */}
          <div className="bg-black/70 rounded-xl p-5 border border-cyan-500/40">
            <h3 className="text-xl font-orbitron font-bold text-cyan-300 mb-4 text-center">
              HOUSE RULES
            </h3>
            <div className="space-y-3">
              {[
                { icon: RiAuctionFill, label: "Auction", key: "auction" as const },
                { icon: GiPrisoner, label: "Rent in Jail", key: "rentInPrison" as const },
                { icon: GiBank, label: "Mortgage", key: "mortgage" as const },
                { icon: IoBuild, label: "Even Build", key: "evenBuild" as const },
                { icon: FaRandom, label: "Random Order", key: "randomPlayOrder" as const },
              ].map(item => {
                const Icon = item.icon;
                return (
                  <div key={item.key} className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <Icon className="w-5 h-5 text-cyan-400" />
                      <span className="text-white text-base font-medium">{item.label}</span>
                    </div>
                    <Switch
                      checked={settings[item.key]}
                      onCheckedChange={v => handleSettingChange(item.key, v)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Create Game Button */}
        <div className="flex justify-center mt-6">
          <button
            onClick={handlePlay}
            disabled={isPending || isRegisteredLoading}
            className="px-12 py-4 text-xl font-orbitron font-bold tracking-wider
                       bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-purple-600 hover:to-pink-600
                       rounded-xl shadow-xl transform hover:scale-105 transition-all duration-300
                       border-4 border-cyan-400/80 relative overflow-hidden
                       disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isPending ? "CREATING..." : "CREATE GAME"}
          </button>
        </div>

      </div>
    </div>
  );
}