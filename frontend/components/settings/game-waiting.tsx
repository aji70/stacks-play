"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PiTelegramLogoLight } from "react-icons/pi";
import { FaXTwitter } from "react-icons/fa6";
import { IoCopyOutline, IoHomeOutline } from "react-icons/io5";
import { useStacks } from "@/hooks/use-stacks";

import { apiClient } from "@/lib/api";
import { Game } from "@/lib/types/games";
import { getPlayerSymbolData, PlayerSymbol, symbols } from "@/lib/types/symbol";
import { ApiResponse } from "@/types/api";
import { ClarityType } from "@stacks/transactions";

const POLL_INTERVAL = 5000;
const COPY_FEEDBACK_MS = 2000;

export default function GameWaiting() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawGameCode = searchParams.get("gameCode") ?? "";
  const gameCode = rawGameCode.trim().toUpperCase();

  const { userData, handleGetGameByCode, handleJoinGamee } = useStacks();
  const address = userData?.addresses?.stx?.[0]?.address ?? "";

  // UI state
  const [game, setGame] = useState<Game | null>(null);
  const [playerSymbol, setPlayerSymbol] = useState<PlayerSymbol | null>(null);
  const [availableSymbols, setAvailableSymbols] = useState<PlayerSymbol[]>(symbols);
  const [isJoined, setIsJoined] = useState<boolean>(false);
  const [copySuccess, setCopySuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  // Contract state (authoritative)
  const [contractId, setContractId] = useState<number | null>(null);
  const [contractJoinedPlayers, setContractJoinedPlayers] = useState<number | null>(null);
  const [contractNumberOfPlayers, setContractNumberOfPlayers] = useState<number | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Sharing URLs
  const origin = useMemo(() => {
    try {
      if (typeof window === "undefined") return "";
      return window.location?.origin ?? "";
    } catch {
      return "";
    }
  }, []);

  const gameUrl = useMemo(
    () => `${origin}/game-waiting?gameCode=${encodeURIComponent(gameCode)}`,
    [origin, gameCode]
  );

  const shareText = useMemo(
    () => `Join my Tycoon game! Code: ${gameCode}. Waiting room: ${gameUrl}`,
    [gameCode, gameUrl]
  );

  const telegramShareUrl = useMemo(
    () =>
      `https://t.me/share/url?url=${encodeURIComponent(gameUrl)}&text=${encodeURIComponent(shareText)}`,
    [gameUrl, shareText]
  );

  const twitterShareUrl = useMemo(
    () => `https://x.com/intent/tweet?text=${encodeURIComponent(shareText)}`,
    [shareText]
  );

  // Helpers
  const computeAvailableSymbols = useCallback((g: Game | null) => {
    if (!g) return symbols;
    const taken = new Set(g.players.map((p) => p.symbol));
    return symbols.filter((s) => !taken.has(s.value));
  }, []);

  const checkPlayerJoined = useCallback(
    (g: Game | null) => {
      if (!g || !address) return false;
      return g.players.some((p) => p.address.toLowerCase() === address.toLowerCase());
    },
    [address]
  );

  // Polling: contract is the source of truth
  useEffect(() => {
    if (!gameCode) {
      setError("No game code provided.");
      setLoading(false);
      return;
    }

    let pollTimer: number | null = null;

    const fetchOnce = async () => {
      setError(null);
      try {
        // 1. Get authoritative on-chain state
        const contractData = await handleGetGameByCode(gameCode);

        if (!contractData) {
          throw new Error("No contract data returned");
        }

        if (contractData.type === ClarityType.OptionalNone) {
          throw new Error("Game not found on chain");
        }

        if (contractData.type !== ClarityType.OptionalSome) {
          throw new Error("Unexpected response type");
        }

        const tuple = contractData.value;

        if (tuple.type !== ClarityType.Tuple) {
          throw new Error("Expected tuple data");
        }

        const data = tuple.value;

        const idCV = data["id"];
        const joinedCV = data["joined-players"];
        const numPlayersCV = data["number-of-players"];

        if (!idCV || idCV.type !== ClarityType.UInt) {
          throw new Error("Invalid id");
        }

        if (!joinedCV || joinedCV.type !== ClarityType.UInt) {
          throw new Error("Invalid joined-players");
        }

        if (!numPlayersCV || numPlayersCV.type !== ClarityType.UInt) {
          throw new Error("Invalid number-of-players");
        }

        const newId = Number(idCV.value);
        const newJoined = Number(joinedCV.value);
        const newMax = Number(numPlayersCV.value);

        setContractId(newId);
        setContractJoinedPlayers(newJoined);
        setContractNumberOfPlayers(newMax);

        // Game full on-chain → start game
        if (newJoined === newMax && newMax > 0) {
          await apiClient.put<ApiResponse>(`/games/code/${gameCode}`, { status: "RUNNING" });
          router.replace(`/game-play?gameCode=${encodeURIComponent(gameCode)}`);
          return;
        }

        // 2. Fetch API for rich UI (names, symbols)
        const res = await apiClient.get<ApiResponse>(`/games/code/${encodeURIComponent(gameCode)}`);
        if (!res?.success || !res.data) throw new Error("Game not found");

        const gameData = res.data as Game;

        if (gameData.status === "RUNNING") {
          router.replace(`/game-play?gameCode=${encodeURIComponent(gameCode)}`);
          return;
        }

        // Update UI only if changed
        if (JSON.stringify(gameData) !== JSON.stringify(game)) {
          setGame(gameData);
          setAvailableSymbols(computeAvailableSymbols(gameData));
          setIsJoined(checkPlayerJoined(gameData));
        }
      } catch (err: any) {
        console.error("fetch error:", err);
        if (mountedRef.current) {
          setError(err?.message || "Failed to load game");
        }
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    };

    fetchOnce();

    pollTimer = window.setInterval(() => {
      if (document.hidden) return;
      fetchOnce();
    }, POLL_INTERVAL);

    return () => {
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [gameCode, game, handleGetGameByCode, router]);

  // Display counts from contract (authoritative)
  const playersJoined = contractJoinedPlayers ?? game?.players.length ?? 0;
  const maxPlayers = contractNumberOfPlayers ?? game?.number_of_players ?? 0;

  const showShare = playersJoined < maxPlayers;

  // Copy link
  const handleCopyLink = useCallback(async () => {
    if (!gameUrl) return setError("No shareable URL available.");
    try {
      await navigator.clipboard.writeText(gameUrl);
      setCopySuccess("Copied!");
      setTimeout(() => setCopySuccess(null), COPY_FEEDBACK_MS);
    } catch (err) {
      console.error("copy failed", err);
      setError("Failed to copy link.");
    }
  }, [gameUrl]);

  // Join game
  const handleJoinGame = useCallback(async () => {
    if (!game) return setError("No game data.");
    if (!playerSymbol?.value || !availableSymbols.some((s) => s.value === playerSymbol.value))
      return setError("Please select a valid symbol.");
    if (playersJoined >= maxPlayers) return setError("Game is full!");

    setActionLoading(true);
    setError(null);

    try {
      if (contractId !== null) {
        await handleJoinGamee(contractId, playerSymbol.id);
      }

      const res = await apiClient.post<ApiResponse>("/game-players/join", {
        address,
        symbol: playerSymbol.value,
        code: game.code,
      });

      if (!res?.success) throw new Error(res?.message ?? "Join failed");

      setIsJoined(true);
    } catch (err: any) {
      setError(err?.message ?? "Failed to join game");
    } finally {
      setActionLoading(false);
    }
  }, [
    game,
    playerSymbol,
    availableSymbols,
    playersJoined,
    maxPlayers,
    contractId,
    address,
    handleJoinGamee,
  ]);

  // Leave game
  const handleLeaveGame = useCallback(async () => {
    if (!game) return setError("No game data.");
    setActionLoading(true);
    setError(null);
    try {
      const res = await apiClient.post<ApiResponse>("/game-players/leave", {
        address,
        code: game.code,
      });
      if (!res?.success) throw new Error(res?.message ?? "Leave failed");
      setIsJoined(false);
      setPlayerSymbol(null);
    } catch (err: any) {
      setError(err?.message ?? "Failed to leave game");
    } finally {
      setActionLoading(false);
    }
  }, [game, address]);

  const handleGoHome = useCallback(() => router.push("/"), [router]);

  // Loading / Error UI
  if (loading) {
    return (
      <section className="w-full h-[calc(100dvh-87px)] flex items-center justify-center bg-gray-900">
        <div className="flex flex-col items-center space-y-3">
          <div className="animate-spin rounded-full h-12 w-12 border-t-3 border-[#00F0FF] border-opacity-50"></div>
          <p className="text-[#00F0FF] text-lg font-semibold font-orbitron animate-pulse">
            Entering the Lobby...
          </p>
        </div>
      </section>
    );
  }

  if (error || !game) {
    return (
      <section className="w-full h-[calc(100dvh-87px)] flex items-center justify-center bg-gray-900">
        <div className="space-y-3 text-center bg-[#0A1A1B]/80 p-6 rounded-xl shadow-lg border border-red-500/50">
          <p className="text-red-400 text-lg font-bold font-orbitron animate-pulse">
            {error ?? "Game Portal Closed"}
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => router.push("/join-room")}
              className="bg-[#00F0FF]/20 text-[#00F0FF] px-5 py-2 rounded-lg font-orbitron font-bold border border-[#00F0FF]/50 hover:bg-[#00F0FF]/30 transition-all shadow-md hover:shadow-[#00F0FF]/50"
            >
              Retry Join
            </button>
            <button
              onClick={handleGoHome}
              className="bg-[#00F0FF]/20 text-[#00F0FF] px-5 py-2 rounded-lg font-orbitron font-bold border border-[#00F0FF]/50 hover:bg-[#00F0FF]/30 transition-all shadow-md hover:shadow-[#00F0FF]/50"
            >
              Return to Base
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="w-full h-[calc(100dvh-87px)] bg-settings bg-cover bg-fixed bg-center">
      <main className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-[#010F10]/90 to-[#010F10]/50 px-4 sm:px-6">
        <div className="w-full max-w-xl bg-[#0A1A1B]/80 p-5 sm:p-6 rounded-2xl shadow-2xl border border-[#00F0FF]/50 backdrop-blur-md">
          <h2 className="text-2xl sm:text-3xl font-bold font-orbitron mb-6 text-[#F0F7F7] text-center tracking-widest bg-gradient-to-r from-[#00F0FF] to-[#FF00FF] bg-clip-text text-transparent animate-pulse">
            Tycoon Lobby
            <span className="block text-base text-[#00F0FF] mt-1 font-extrabold">
              Code: {gameCode}
            </span>
          </h2>

          <div className="text-center space-y-3 mb-6">
            <p className="text-[#869298] text-sm font-semibold">
              {playersJoined === maxPlayers
                ? "Full House! Game Starting Soon..."
                : "Assemble Your Rivals..."}
            </p>

            <div className="w-full bg-[#003B3E]/50 h-2 rounded-full overflow-hidden shadow-inner">
              <div
                className="bg-gradient-to-r from-[#00F0FF] to-[#00FFAA] h-full transition-all duration-700 ease-out"
                style={{ width: `${(playersJoined / maxPlayers) * 100}%` }}
              />
            </div>

            <p className="text-[#00F0FF] text-lg font-bold">
              Players Ready: {playersJoined}/{maxPlayers}
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 justify-center">
              {Array.from({ length: maxPlayers }).map((_, index) => {
                const player = game.players[index];
                return (
                  <div
                    key={index}
                    className="bg-[#010F10]/70 p-3 rounded-lg border border-[#00F0FF]/30 flex flex-col items-center justify-center shadow-md hover:shadow-[#00F0FF]/50 transition-all duration-300"
                  >
                    <span className="text-4xl mb-1">
                      {player
                        ? symbols.find((s) => s.value === player.symbol)?.emoji ?? "❓"
                        : "❓"}
                    </span>
                    <p className="text-[#F0F7F7] text-xs font-semibold truncate max-w-[80px]">
                      {player?.username || "Slot Open"}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {showShare && (
            <div className="mt-6 space-y-5 bg-[#010F10]/50 p-5 rounded-xl border border-[#00F0FF]/30 shadow-lg">
              <h3 className="text-lg font-bold text-[#00F0FF] text-center mb-3">
                Summon Allies!
              </h3>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={gameUrl}
                  readOnly
                  className="w-full bg-[#0A1A1B] text-[#F0F7F7] p-2 rounded-lg border border-[#00F0FF]/50 focus:outline-none font-orbitron text-xs shadow-inner"
                />
                <button
                  onClick={handleCopyLink}
                  disabled={actionLoading}
                  className="bg-gradient-to-r from-[#00F0FF] to-[#00FFAA] text-black p-2 rounded-lg hover:opacity-90 transition-all shadow-md hover:shadow-lg"
                >
                  <IoCopyOutline className="w-5 h-5" />
                </button>
              </div>

              {copySuccess && (
                <p className="text-green-400 text-xs text-center animate-pulse">
                  {copySuccess}
                </p>
              )}

              <div className="flex justify-center gap-5">
                <a
                  href={telegramShareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-[#0A1A1B] text-[#0FF0FC] p-3 rounded-full border border-[#00F0FF]/50 hover:bg-[#00F0FF]/20 transition-all shadow-md hover:shadow-[#00F0FF]/50 hover:scale-110"
                >
                  <PiTelegramLogoLight className="w-6 h-6" />
                </a>
                <a
                  href={twitterShareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-[#0A1A1B] text-[#0FF0FC] p-3 rounded-full border border-[#00F0FF]/50 hover:bg-[#00F0FF]/20 transition-all shadow-md hover:shadow-[#00F0FF]/50 hover:scale-110"
                >
                  <FaXTwitter className="w-6 h-6" />
                </a>
              </div>
            </div>
          )}

          {playersJoined < maxPlayers && !isJoined && (
            <div className="mt-6 space-y-5">
              <div className="bg-[#010F10]/50 p-5 rounded-xl border border-[#00F0FF]/30 shadow-lg">
                <label className="text-sm text-[#00F0FF] mb-1 font-orbitron font-bold">
                  Pick Your Token
                </label>
                <select
                  value={playerSymbol?.value ?? ""}
                  onChange={(e) =>
                    setPlayerSymbol(getPlayerSymbolData(e.target.value) ?? null)
                  }
                  className="w-full bg-[#0A1A1B] text-[#F0F7F7] p-2 rounded-lg border border-[#00F0FF]/50 focus:outline-none focus:ring-2 focus:ring-[#00F0FF] font-orbitron text-sm shadow-inner"
                >
                  <option value="" disabled>
                    Select Token
                  </option>
                  {availableSymbols.length > 0 ? (
                    availableSymbols.map((symbol) => (
                      <option key={symbol.value} value={symbol.value}>
                        {symbol.emoji} {symbol.name}
                      </option>
                    ))
                  ) : (
                    <option disabled>No Tokens Left</option>
                  )}
                </select>
              </div>

              <button
                onClick={handleJoinGame}
                disabled={!playerSymbol || actionLoading}
                className="w-full bg-gradient-to-r from-[#00F0FF] to-[#FF00FF] text-black font-orbitron font-extrabold py-3 rounded-xl shadow-lg hover:scale-105 transition disabled:opacity-50"
              >
                {actionLoading ? "Entering..." : "Join the Battle"}
              </button>
            </div>
          )}

          {playersJoined < maxPlayers && isJoined && (
            <button
              onClick={handleLeaveGame}
              disabled={actionLoading}
              className="w-full mt-6 bg-gradient-to-r from-[#FF4D4D] to-[#FF00AA] text-white font-orbitron font-extrabold py-3 rounded-xl shadow-lg hover:scale-105 transition"
            >
              {actionLoading ? "Exiting..." : "Abandon Ship"}
            </button>
          )}

          <div className="flex justify-between mt-6 px-3">
            <button
              onClick={() => router.push("/join-room")}
              className="text-[#0FF0FC] text-sm font-orbitron hover:underline"
            >
              Switch Portal
            </button>
            <button
              onClick={handleGoHome}
              className="flex items-center text-[#0FF0FC] text-sm font-orbitron hover:underline"
            >
              <IoHomeOutline className="mr-1 w-4 h-4" />
              Back to HQ
            </button>
          </div>

          {error && (
            <p className="text-red-400 text-xs mt-4 text-center bg-red-900/50 p-2 rounded-lg animate-pulse">
              {error}
            </p>
          )}
        </div>
      </main>
    </section>
  );
}