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
import { TupleCV } from "@stacks/transactions";
const POLL_INTERVAL = 3000; // Fast polling for responsive feel
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
  // Contract state – authoritative for player count & game start
  const [id, setId] = useState<number | null>(null);
  const [joinedPlayers, setJoinedPlayers] = useState<number | null>(null);
  const [numberOfPlayers, setNumberOfPlayers] = useState<number | null>(null);
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
      `https://t.me/share/url?url=${encodeURIComponent(
        gameUrl
      )}&text=${encodeURIComponent(shareText)}`,
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
      return g.players.some(
        (p) => p.address.toLowerCase() === address.toLowerCase()
      );
    },
    [address]
  );
  // Polling effect
  useEffect(() => {
    if (!gameCode) {
      setError("No game code provided.");
      setLoading(false);
      return;
    }
    let timer: NodeJS.Timeout | null = null;
    const fetchOnce = async (isInitial: boolean = false) => {
      setError(null);
      try {
        // 1. Contract state (authoritative)
        const contractData = await handleGetGameByCode(gameCode);
        const tuple = contractData as TupleCV;
        const newId = Number((tuple.value.id as TupleCV).value);
        const newJoined = Number((tuple.value["joined-players"] as TupleCV).value);
        const newMax = Number((tuple.value["number-of-players"] as TupleCV).value);
        if (newId !== id) setId(newId);
        if (newJoined !== joinedPlayers) setJoinedPlayers(newJoined);
        if (newMax !== numberOfPlayers) setNumberOfPlayers(newMax);
        // 2. Game full on-chain → start immediately
        if (newJoined === newMax && newMax > 0) {
          // Update backend status (fire-and-forget)
          apiClient
            .put<ApiResponse>(`/games/code/${gameCode}`, { status: "RUNNING" })
            .catch(() => {});
          router.replace(`/game-play?gameCode=${encodeURIComponent(gameCode)}`);
          return;
        }
        // 3. Fetch API for rich display data
        const res = await apiClient.get<ApiResponse>(
          `/games/code/${encodeURIComponent(gameCode)}`
        );
        if (!res?.success || !res.data) throw new Error("Game not found");
        const gameData = res.data as Game;
       
        console.log("Fetched game data:", gameData.status);
        // If backend already says RUNNING → redirect
        if (gameData.status === "RUNNING") {
          router.replace(`/game-play?gameCode=${encodeURIComponent(gameCode)}`);
          return;
        }
        // Check if full via API and update status
        if (gameData.players.length === gameData.number_of_players) {
          const updateRes = await apiClient.put<ApiResponse>(
            `/games/${gameData.id}`,
            { status: "RUNNING" }
          );
          if (updateRes?.success) {
            router.replace(`/game-play?gameCode=${encodeURIComponent(gameCode)}`);
            return;
          }
        }
        // Update UI state only if changed
        if (JSON.stringify(gameData) !== JSON.stringify(game)) {
          setGame(gameData);
          setAvailableSymbols(computeAvailableSymbols(gameData));
          setIsJoined(checkPlayerJoined(gameData));
        }
      } catch (err: unknown) {
        if ((err as any)?.name === "AbortError") return;
        console.error("fetch error:", err);
        if (mountedRef.current && isInitial)
          setError((err as Error)?.message || "Failed to load game");
      } finally {
        if (mountedRef.current && isInitial) setLoading(false);
      }
    };
    fetchOnce(true);
    timer = setInterval(() => {
      if (document.hidden) return;
      fetchOnce(false);
    }, POLL_INTERVAL);
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [
    gameCode,
    handleGetGameByCode,
    id,
    joinedPlayers,
    numberOfPlayers,
    computeAvailableSymbols,
    checkPlayerJoined,
    router,
  ]);
  // Counts
  const contractJoined = joinedPlayers ?? 0;
  const contractMax = numberOfPlayers ?? game?.number_of_players ?? 0;
  const apiJoined = game?.players.length ?? 0;
  const apiMax = game?.number_of_players ?? 0;
  const showShare = contractJoined < contractMax;
  // Manual start (fallback for impatient players)
  const handleManualStart = () => {
    router.replace(`/game-play?gameCode=${encodeURIComponent(gameCode)}`);
  };
  // Copy link
  const handleCopyLink = useCallback(async () => {
    if (!gameUrl) return setError("No shareable URL available.");
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(gameUrl);
      } else {
        const el = document.createElement("textarea");
        el.value = gameUrl;
        el.setAttribute("readonly", "");
        el.style.position = "absolute";
        el.style.left = "-9999px";
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
      }
      setCopySuccess("Copied!");
      setTimeout(() => setCopySuccess(null), COPY_FEEDBACK_MS);
    } catch (err) {
      console.error("copy failed", err);
      setError("Failed to copy link.");
    }
  }, [gameUrl]);
  // Join game
  const handleJoin = useCallback(async () => {
    if (!game) return setError("No game data.");
    if (!playerSymbol?.value || !availableSymbols.some((s) => s.value === playerSymbol.value))
      return setError("Please select a valid symbol.");
    if (contractJoined >= contractMax) return setError("Game is full!");
    setActionLoading(true);
    setError(null);
    try {
      if (id !== null) {
        await handleJoinGamee(id, playerSymbol.id);
      }
      const res = await apiClient.post<ApiResponse>("/game-players/join", {
        address,
        symbol: playerSymbol.value,
        code: game.code,
      });
      if (!res?.success) throw new Error(res?.message ?? "Join failed");
      if (mountedRef.current) setIsJoined(true);
    } catch (err: unknown) {
      if (mountedRef.current)
        setError((err as Error)?.message ?? "Failed to join game");
    } finally {
      if (mountedRef.current) setActionLoading(false);
    }
  }, [
    game,
    playerSymbol,
    availableSymbols,
    contractJoined,
    contractMax,
    id,
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
      if (mountedRef.current) {
        setIsJoined(false);
        setPlayerSymbol(null);
      }
    } catch (err: unknown) {
      if (mountedRef.current)
        setError((err as Error)?.message ?? "Failed to leave game");
    } finally {
      if (mountedRef.current) setActionLoading(false);
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
            <span className="block text-base text-[#00F0FF] mt-1 font-extrabold shadow-text">
              Code: {gameCode}
            </span>
          </h2>
          <div className="text-center space-y-3 mb-6">
            <p className="text-[#869298] text-sm font-semibold">
              {contractJoined === contractMax
                ? "Full House! Starting..."
                : "Assemble Your Rivals..."}
            </p>
            <div className="w-full bg-[#003B3E]/50 h-2 rounded-full overflow-hidden shadow-inner">
              <div
                className="bg-gradient-to-r from-[#00F0FF] to-[#00FFAA] h-full transition-all duration-500 ease-out"
                style={{ width: `${(contractJoined / contractMax) * 100}%` }}
              ></div>
            </div>
            <p className="text-[#00F0FF] text-lg font-bold">
              Players Ready: {contractJoined}/{contractMax}
            </p>
            {/* Sync lag indicator */}
            {apiJoined > contractJoined && (
              <p className="text-yellow-400 text-sm animate-pulse">
                ⏳ Confirming on-chain ({apiJoined}/{apiMax} joined so far)
              </p>
            )}
            {/* Optimistic full message + manual start button */}
            {apiJoined === apiMax && contractJoined < contractMax && (
              <div className="mt-4 p-4 bg-green-900/50 rounded-xl border border-green-500/50">
                <p className="text-green-300 font-bold text-lg">🎉 All players joined!</p>
                <p className="text-sm mt-1">
                  Waiting for final blockchain confirmation (usually 10–60s)
                </p>
                <button
                  onClick={handleManualStart}
                  className="mt-4 bg-gradient-to-r from-[#00FFAA] to-[#00F0FF] text-black px-8 py-3 rounded-xl font-bold shadow-lg hover:scale-105 transition"
                >
                  Start Game Now
                </button>
              </div>
            )}
            {/* Player slots – uses API for symbols & usernames */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 justify-center">
              {Array.from({ length: contractMax }).map((_, index) => {
                const player = game.players[index];
                return (
                  <div
                    key={index}
                    className="bg-[#010F10]/70 p-3 rounded-lg border border-[#00F0FF]/30 flex flex-col items-center justify-center shadow-md hover:shadow-[#00F0FF]/50 transition-shadow duration-300"
                  >
                    <span className="text-4xl mb-1 animate-bounce-slow">
                      {player
                        ? symbols.find((s) => s.value === player.symbol)?.emoji
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
                  className="w-full bg-[#0A1A1B] text-[#F0F7F7] p-2 rounded-lg border border-[#00F0FF]/50 focus:outline-none focus:ring-2 focus:ring-[#00F0FF] font-orbitron text-xs shadow-inner"
                />
                <button
                  onClick={handleCopyLink}
                  disabled={actionLoading}
                  className="flex items-center justify-center bg-gradient-to-r from-[#00F0FF] to-[#00FFAA] text-black p-2 rounded-lg hover:opacity-90 transition-all duration-300 shadow-md hover:shadow-lg transform hover:scale-105"
                >
                  <IoCopyOutline className="w-5 h-5" />
                </button>
              </div>
              {copySuccess && (
                <p className="text-green-400 text-xs text-center animate-fade-in">
                  {copySuccess}
                </p>
              )}
              <div className="flex justify-center gap-5">
                <a
                  href={telegramShareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center bg-[#0A1A1B] text-[#0FF0FC] p-3 rounded-full border border-[#00F0FF]/50 hover:bg-[#00F0FF]/20 transition-all duration-300 shadow-md hover:shadow-[#00F0FF]/50 transform hover:scale-110"
                >
                  <PiTelegramLogoLight className="w-6 h-6" />
                </a>
                <a
                  href={twitterShareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center bg-[#0A1A1B] text-[#0FF0FC] p-3 rounded-full border border-[#00F0FF]/50 hover:bg-[#00F0FF]/20 transition-all duration-300 shadow-md hover:shadow-[#00F0FF]/50 transform hover:scale-110"
                >
                  <FaXTwitter className="w-6 h-6" />
                </a>
              </div>
            </div>
          )}
          {contractJoined < contractMax && !isJoined && (
            <div className="mt-6 space-y-5">
              <div className="flex flex-col bg-[#010F10]/50 p-5 rounded-xl border border-[#00F0FF]/30 shadow-lg">
                <label
                  htmlFor="symbol"
                  className="text-sm text-[#00F0FF] mb-1 font-orbitron font-bold"
                >
                  Pick Your Token
                </label>
                <select
                  id="symbol"
                  value={playerSymbol?.value ?? ""}
                  onChange={(e) =>
                    setPlayerSymbol(getPlayerSymbolData(e.target.value) ?? null)
                  }
                  className="bg-[#0A1A1B] text-[#F0F7F7] p-2 rounded-lg border border-[#00F0FF]/50 focus:outline-none focus:ring-2 focus:ring-[#00F0FF] font-orbitron text-sm shadow-inner"
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
                onClick={handleJoin}
                disabled={!playerSymbol || actionLoading}
                className="w-full bg-gradient-to-r from-[#00F0FF] to-[#FF00FF] text-black text-sm font-orbitron font-extrabold py-3 rounded-xl hover:opacity-90 transition-all duration-300 shadow-lg hover:shadow-[#00F0FF]/50 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionLoading ? "Entering..." : "Join the Battle"}
              </button>
            </div>
          )}
          {contractJoined < contractMax && isJoined && (
            <button
              onClick={handleLeaveGame}
              disabled={actionLoading}
              className="w-full mt-6 bg-gradient-to-r from-[#FF4D4D] to-[#FF00AA] text-white text-sm font-orbitron font-extrabold py-3 rounded-xl hover:opacity-90 transition-all duration-300 shadow-lg hover:shadow-red-500/50 transform hover:scale-105 disabled:opacity-50"
            >
              {actionLoading ? "Exiting..." : "Abandon Ship"}
            </button>
          )}
          <div className="flex justify-between mt-5 px-3">
            <button
              onClick={() => router.push("/join-room")}
              className="text-[#0FF0FC] text-sm font-orbitron hover:text-[#00D4E6] transition-colors duration-200 hover:underline"
            >
              Switch Portal
            </button>
            <button
              onClick={handleGoHome}
              className="flex items-center text-[#0FF0FC] text-sm font-orbitron hover:text-[#00D4E6] transition-colors duration-200 hover:underline"
            >
              <IoHomeOutline className="mr-1 w-4 h-4" />
              Back to HQ
            </button>
          </div>
        </div>
      </main>
    </section>
  );
}