"use client";

import React, {
  Component,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import PropertyCard from "./cards/property-card";
import SpecialCard from "./cards/special-card";
import CornerCard from "./cards/corner-card";
import {
  Game,
  GameProperty,
  Property,
  Player,
  PROPERTY_ACTION,
  CardTypes,
} from "@/types/game";
import { useStacks } from "@/hooks/use-stacks";
import { getPlayerSymbol } from "@/lib/types/symbol";
import { apiClient } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import toast, { Toaster } from "react-hot-toast";
import { ApiResponse } from "@/types/api";
import { motion, AnimatePresence } from "framer-motion";

/* ============================================
   TYPES
   ============================================ */

interface GameProps {
  game: Game;
  properties: Property[];
  game_properties: GameProperty[];
  my_properties: Property[];
  me: Player | null;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

interface CardPopup {
  type: "chance" | "community_chest";
  message: string;
  action?: string;
}

/* ============================================
   ERROR BOUNDARY
   ============================================ */

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="text-red-400 text-center mt-10">
          Something went wrong. Please refresh the page.
        </div>
      );
    }
    return this.props.children;
  }
}

/* ============================================
   CONSTANTS
   ============================================ */

const BOARD_SQUARES = 40;
const ROLL_ANIMATION_MS = 1200;

/* ============================================
   HELPERS
   ============================================ */

const getDiceValues = (): { die1: number; die2: number; total: number } | null => {
  const die1 = Math.floor(Math.random() * 6) + 1;
  const die2 = Math.floor(Math.random() * 6) + 1;
  const total = die1 + die2;
  return total === 12 ? null : { die1, die2, total };
};

const isTopHalf = (square: any) => {
  return square.grid_row === 1;
};

/* ============================================
   SAFE STATE HOOK
   ============================================ */

function useSafeState<S>(initial: S) {
  const isMounted = useRef(false);
  const [state, setState] = useState(initial);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const safeSetState = useCallback(
    (value: React.SetStateAction<S>) => {
      if (isMounted.current) setState(value);
    },
    []
  );

  return [state, safeSetState] as const;
}

/* ============================================
   DICE FACE
   ============================================ */

const DiceFace = ({ value }: { value: number }) => {
  const dotPositions: Record<number, [number, number][]> = {
    1: [[50, 50]],
    2: [[28, 28], [72, 72]],
    3: [[28, 28], [50, 50], [72, 72]],
    4: [[28, 28], [28, 72], [72, 28], [72, 72]],
    5: [[28, 28], [28, 72], [50, 50], [72, 28], [72, 72]],
    6: [[28, 28], [28, 50], [28, 72], [72, 28], [72, 50], [72, 72]],
  };

  return (
    <>
      {dotPositions[value].map(([x, y], i) => (
        <div
          key={i}
          className="absolute w-7 h-7 bg-black rounded-full shadow-inner"
          style={{
            top: `${y}%`,
            left: `${x}%`,
            transform: "translate(-50%, -50%)",
          }}
        />
      ))}
    </>
  );
};

/* ============================================
   MAIN GAME BOARD
   ============================================ */

const GameBoard = ({
  game,
  properties,
  game_properties,
  my_properties,
  me,
}: GameProps) => {
  const { userData } = useStacks();
  const router = useRouter();
  const queryClient = useQueryClient();

  /* ---------- State ---------- */
  const [players, setPlayers] = useSafeState<Player[]>(game?.players ?? []);
  const [boardData] = useSafeState<Property[]>(properties ?? []);
  const [isRolling, setIsRolling] = useSafeState(false);
  const [rollAgain, setRollAgain] = useSafeState(false);
  const [roll, setRoll] = useSafeState<{ die1: number; die2: number; total: number } | null>(null);
  const [pendingRoll, setPendingRoll] = useSafeState<number>(0);
  const [actionLock, setActionLock] = useSafeState<"ROLL" | "END" | null>(null);
  const [currentCard, setCurrentCard] = useSafeState<CardPopup | null>(null);
  const [buyPrompted, setBuyPrompted] = useState(false);

  const isMyTurn = me?.user_id && game?.next_player_id === me.user_id;

  const lastProcessedPosition = useRef<number | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);

  /* ---------- Locks ---------- */
  const lockAction = useCallback(
    (type: "ROLL" | "END") => {
      if (actionLock) return false;
      setActionLock(type);
      return true;
    },
    [actionLock, setActionLock]
  );

  const unlockAction = useCallback(() => setActionLock(null), [setActionLock]);

  /* ---------- Sync Game ---------- */
  const fetchUpdatedGame = useCallback(async () => {
    try {
      const res = await apiClient.get<ApiResponse>(`/games/code/${game.code}`);
      if (res.success) {
        const gameData = res.data as Game;
        if (gameData && Array.isArray((gameData as any).players)) {
          setPlayers((gameData as any).players);
        }
        return gameData;
      }
    } catch (err) {
      console.error("fetchUpdatedGame error:", err);
    }
    return null;
  }, [game.code, setPlayers]);

  useEffect(() => {
    const interval = setInterval(fetchUpdatedGame, 10000);
    return () => clearInterval(interval);
  }, [fetchUpdatedGame]);

  /* ---------- Landing Logic & Buy Prompt ---------- */
  useEffect(() => {
    if (!properties.length || !me?.position || !game?.players) return;

    if (me.position === lastProcessedPosition.current) return;
    lastProcessedPosition.current = me.position;

    const square = properties.find((p) => p.id === me.position);
    if (!square) return;

    const owned = game_properties.some((gp) => gp.property_id === square.id);
    const action = PROPERTY_ACTION(square.id);
    const myPlayer = game.players.find((p) => p.user_id === me?.user_id);
    const hasRolled = (myPlayer?.rolls ?? 0) > 0;

    // Reset buy prompt
    setBuyPrompted(false);

    // Show buy prompt only if it's my turn, rolled, and property is buyable
    if (
      isMyTurn &&
      hasRolled &&
      !owned &&
      action &&
      ["land", "railway", "utility"].includes(action)
    ) {
      setBuyPrompted(true);
      toast("You landed on a buyable property!", { icon: "🏠" });
    }
  }, [
    me?.position,
    me?.user_id,
    isMyTurn,
    properties,
    game_properties,
    game?.players,
  ]);

  /* ---------- Card Detection ---------- */
  const latestCardEntry = useMemo<CardPopup | null>(() => {
    if (!game.history || game.history.length === 0) return null;
    const entry = game.history[game.history.length - 1];
    const comment = (entry.comment ?? "").toLowerCase();

    if (!comment.includes("chance") && !comment.includes("community chest")) return null;

    const isChance = comment.includes("chance");
    const match = entry.comment?.match(/(?:chance|community chest)[:-]?\s*(.+)/i);
    const message = match ? match[1].trim() : entry.comment;

    return {
      type: isChance ? "chance" : "community_chest",
      message: message || "Card drawn",
    };
  }, [game.history]);

  const historyLengthRef = useRef(0);
  useEffect(() => {
    if (latestCardEntry && game.history.length > historyLengthRef.current) {
      setCurrentCard(latestCardEntry);
      historyLengthRef.current = game.history.length;
      const timer = setTimeout(() => setCurrentCard(null), 8000);
      return () => clearTimeout(timer);
    }
  }, [latestCardEntry, game.history.length, setCurrentCard]);

  /* ---------- Buy Property ---------- */
  const BUY_PROPERTY = useCallback(async () => {
    if (!me?.user_id || !properties.length) return;

    const square = properties.find((p) => p.id === me.position);
    if (!square) return;

    try {
      await apiClient.post("/game-properties/buy", {
        user_id: me.user_id,
        game_id: game.id,
        property_id: square.id,
      });

      toast.success(`You bought ${square.name}!`);
      setBuyPrompted(false);
      await fetchUpdatedGame();

      // Auto end turn after buy
      setTimeout(() => END_TURN(me.user_id), 1000);
    } catch (err) {
      toast.error("Failed to buy property");
    }
  }, [me?.user_id, me?.position, properties, game.id, fetchUpdatedGame]);

  /* ---------- End Turn ---------- */
  const END_TURN = useCallback(
    async (userId?: number) => {
      const id = userId ?? me?.user_id;
      if (!id || !lockAction("END")) return;

      try {
        await apiClient.post("/game-players/end-turn", {
          user_id: id,
          game_id: game.id,
        });

        toast.success("Turn ended");
        setRoll(null);
        setBuyPrompted(false);
        await fetchUpdatedGame();
      } catch (err) {
        toast.error("Failed to end turn");
      } finally {
        unlockAction();
      }
    },
    [me?.user_id, game.id, lockAction, unlockAction, fetchUpdatedGame]
  );

  /* ---------- Auto End Turn When No Action Needed ---------- */
  useEffect(() => {
    if (!isMyTurn || !roll || isRolling || buyPrompted) return;

    const myPlayer = game.players.find((p) => p.user_id === me?.user_id);
    if (!myPlayer || (myPlayer.rolls ?? 0) === 0) return;

    const timer = setTimeout(() => {
      END_TURN();
    }, 1200);

    return () => clearTimeout(timer);
  }, [isMyTurn, roll, isRolling, buyPrompted, game.players, me?.user_id, END_TURN]);

  /* ---------- Roll Dice ---------- */
  const ROLL_DICE = useCallback(async () => {
    if (isRolling || actionLock || !lockAction("ROLL")) return;

    setIsRolling(true);
    setRoll(null);

    setTimeout(async () => {
      const value = getDiceValues();
      if (!value) {
        setRollAgain(true);
        toast.success("DOUBLES! Roll again!");
        setIsRolling(false);
        unlockAction();
        return;
      }

      setRoll(value);
      const currentPos = me?.position ?? 0;
      const newPos = (currentPos + value.total + pendingRoll) % BOARD_SQUARES;

      try {
        await apiClient.post("/game-players/change-position", {
          user_id: me?.user_id,
          game_id: game.id,
          position: newPos,
          rolled: value.total + pendingRoll,
          is_double: value.die1 === value.die2,
        });

        setPendingRoll(0);
        await fetchUpdatedGame();
      } catch (err) {
        toast.error("Move failed");
      } finally {
        setIsRolling(false);
        unlockAction();
      }
    }, ROLL_ANIMATION_MS);
  }, [
    isRolling,
    actionLock,
    lockAction,
    unlockAction,
    me?.user_id,
    me?.position,
    pendingRoll,
    game.id,
    fetchUpdatedGame,
  ]);

  /* ---------- Players by Position ---------- */
  const playersByPosition = useMemo(() => {
    const map = new Map<number, Player[]>();
    players.forEach((p) => {
      const pos = Number(p.position ?? 0);
      if (!map.has(pos)) map.set(pos, []);
      map.get(pos)!.push(p);
    });
    return map;
  }, [players]);

  const propertyOwner = (property_id: number) => {
    const gp = game_properties.find((gp) => gp.property_id === property_id);
    return gp ? players.find((p) => p.address === gp.address)?.username || null : null;
  };

  const developmentStage = (id: number) =>
    game_properties.find((gp) => gp.property_id === id)?.development ?? 0;

  const currentPlayer = players.find((p) => p.user_id === game.next_player_id);

  /* ---------- Render ---------- */
  return (
    <ErrorBoundary>
      <div className="w-full min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-cyan-900 text-white p-4 flex flex-col lg:flex-row gap-4 items-start justify-center relative">
        <div className="flex justify-center items-start w-full lg:w-2/3 max-w-[800px] mt-[-1rem]">
          <div className="w-full bg-[#010F10] aspect-square rounded-lg relative shadow-2xl shadow-cyan-500/10">
            <div className="grid grid-cols-11 grid-rows-11 w-full h-full gap-[2px] box-border">
              {/* Center Panel */}
              <div className="col-start-2 col-span-9 row-start-2 row-span-9 bg-[#010F10] flex flex-col justify-center items-center p-4 relative">
                <h1 className="text-3xl lg:text-5xl font-bold text-[#F0F7F7] font-orbitron text-center mb-4">
                  Tycoon
                </h1>

                <AnimatePresence>
                  {isRolling && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="absolute inset-0 flex items-center justify-center gap-16 z-20 pointer-events-none"
                    >
                      <motion.div
                        animate={{ rotateX: [0, 360, 720, 1080], rotateY: [0, 360, -360, 720] }}
                        transition={{ duration: 1.2, ease: "easeOut" }}
                        className="relative w-28 h-28 bg-white rounded-2xl shadow-2xl border-4 border-gray-800"
                        style={{ boxShadow: "0 25px 50px rgba(0,0,0,0.7), inset 0 10px 20px rgba(255,255,255,0.5)" }}
                      >
                        {roll ? <DiceFace value={roll.die1} /> : <motion.div animate={{ rotate: 360 }} transition={{ duration: 0.3, repeat: Infinity }} className="flex h-full items-center justify-center text-6xl font-bold text-gray-400">?</motion.div>}
                      </motion.div>
                      <motion.div
                        animate={{ rotateX: [0, -720, 360, 1080], rotateY: [0, -360, 720, -360] }}
                        transition={{ duration: 1.2, ease: "easeOut", delay: 0.1 }}
                        className="relative w-28 h-28 bg-white rounded-2xl shadow-2xl border-4 border-gray-800"
                        style={{ boxShadow: "0 25px 50px rgba(0,0,0,0.7), inset 0 10px 20px rgba(255,255,255,0.5)" }}
                      >
                        {roll ? <DiceFace value={roll.die2} /> : <motion.div animate={{ rotate: -360 }} transition={{ duration: 0.3, repeat: Infinity }} className="flex h-full items-center justify-center text-6xl font-bold text-gray-400">?</motion.div>}
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {roll && !isRolling && (
                  <motion.div
                    initial={{ scale: 0, y: 50 }}
                    animate={{ scale: 1, y: 0 }}
                    className="flex items-center gap-6 text-7xl font-bold mb-4"
                  >
                    <span className="text-cyan-400 drop-shadow-2xl">{roll.die1}</span>
                    <span className="text-white text-6xl">+</span>
                    <span className="text-pink-400 drop-shadow-2xl">{roll.die2}</span>
                    <span className="text-white mx-4 text-6xl">=</span>
                    <span className="text-yellow-400 text-9xl drop-shadow-2xl">{roll.total}</span>
                  </motion.div>
                )}

                {isMyTurn ? (
                  <>
                    {(() => {
                      const myPlayer = game?.players?.find((p) => p.user_id === me?.user_id);
                      const hasRolled = (myPlayer?.rolls ?? 0) > 0;

                      if (!hasRolled) {
                        return (
                          <button
                            onClick={ROLL_DICE}
                            disabled={isRolling}
                            className="px-8 py-4 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold text-xl rounded-full hover:from-cyan-600 hover:to-blue-700 transform hover:scale-110 active:scale-95 transition-all disabled:opacity-50 shadow-2xl"
                          >
                            {isRolling ? "Rolling..." : "Roll Dice"}
                          </button>
                        );
                      }

                      // After roll
                      if (buyPrompted) {
                        const currentProp = properties.find(p => p.id === me?.position);
                        return (
                          <div className="flex gap-4 flex-wrap justify-center">
                            <button
                              onClick={BUY_PROPERTY}
                              className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold rounded-full hover:from-green-600 hover:to-emerald-700 transform hover:scale-110 active:scale-95 transition-all shadow-lg"
                            >
                              Buy for ${currentProp?.price}
                            </button>
                            <button
                              onClick={() => {
                                toast("Skipped purchase");
                                setBuyPrompted(false);
                                setTimeout(() => END_TURN(), 800);
                              }}
                              className="px-6 py-3 bg-gray-600 text-white font-bold rounded-full hover:bg-gray-700 transform hover:scale-105 active:scale-95 transition-all shadow-lg"
                            >
                              Skip
                            </button>
                          </div>
                        );
                      }

                      // No buy option → auto-end handled by useEffect
                      return null;
                    })()}
                  </>
                ) : (
                  <div className="mt-5 text-center z-10">
                    <motion.h2
                      className="text-2xl font-bold text-pink-300 mb-3"
                      animate={{ opacity: [0.5, 1, 0.5], scale: [1, 1.05, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                    >
                      {currentPlayer?.username} is playing…
                    </motion.h2>
                    <div className="flex justify-center mt-4">
                      <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-cyan-400"></div>
                    </div>
                  </div>
                )}

                {rollAgain && <p className="text-center text-lg text-yellow-300 mt-4">DOUBLES! Roll again!</p>}

                {/* Action Log */}
                <div ref={logRef} className="mt-6 w-full max-w-md bg-gray-900/95 backdrop-blur-md rounded-xl border border-cyan-500/30 shadow-2xl overflow-hidden flex flex-col h-48">
                  <div className="p-3 border-b border-cyan-500/20 bg-gray-800/80">
                    <h3 className="text-sm font-bold text-cyan-300 tracking-wider">Action Log</h3>
                  </div>
                  <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5 scrollbar-thin scrollbar-thumb-cyan-600">
                    {(!game.history || game.history.length === 0) ? (
                      <p className="text-center text-gray-500 text-xs italic py-8">No actions yet</p>
                    ) : (
                      game.history.map((h, i) => (
                        <motion.p key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-xs text-gray-300">
                          <span className="font-medium text-cyan-200">{h.player_name}</span> {h.comment}
                          {h.rolled && <span className="text-cyan-400 font-bold ml-1">[Rolled {h.rolled}]</span>}
                        </motion.p>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Card Modal */}
              <AnimatePresence>
                {currentCard && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
                    onClick={() => setCurrentCard(null)}
                  >
                    <motion.div
                      initial={{ scale: 0, rotateY: -180 }}
                      animate={{ scale: 1, rotateY: 0 }}
                      exit={{ scale: 0, rotateY: 180 }}
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                      className={`relative w-96 max-w-full mx-4 p-10 rounded-3xl shadow-2xl overflow-hidden border
                        ${currentCard.type === "chance" ? "bg-gradient-to-br from-orange-600/90 to-amber-600/90 border-orange-400" : "bg-gradient-to-br from-indigo-600/90 to-purple-600/90 border-purple-400"}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="absolute inset-0 opacity-10">
                        {currentCard.type === "chance" ? "Chance" : "Community Chest"}
                      </div>
                      <div className="absolute inset-0 bg-white/20 animate-pulse" />
                      <motion.div
                        initial={{ y: -30, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.2 }}
                        className="text-center mb-6"
                      >
                        <h2 className="text-4xl font-bold uppercase tracking-widest text-white drop-shadow-lg">
                          {currentCard.type === "chance" ? "Chance" : "Community Chest"}
                        </h2>
                      </motion.div>
                      <motion.p
                        initial={{ y: 30, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.4 }}
                        className="text-xl md:text-2xl text-center font-medium text-white leading-relaxed px-4 drop-shadow-md"
                      >
                        {currentCard.message}
                      </motion.p>
                      <button
                        onClick={() => setCurrentCard(null)}
                        className="absolute top-4 right-4 text-white/70 hover:text-white text-3xl transition"
                      >
                        ×
                      </button>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Board Squares */}
              {boardData.map((square) => {
                const playersHere = playersByPosition.get(square.id) ?? [];
                const devLevel = developmentStage(square.id);

                return (
                  <motion.div
                    key={square.id}
                    style={{
                      gridRowStart: square.grid_row,
                      gridColumnStart: square.grid_col,
                    }}
                    className="w-full h-full p-[2px] relative box-border group hover:z-10 transition-transform duration-200"
                    whileHover={{ scale: 1.75, zIndex: 50 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  >
                    <div className={`w-full h-full transform group-hover:scale-200 ${isTopHalf(square) ? 'origin-top group-hover:origin-bottom group-hover:translate-y-[100px]' : ''} group-hover:shadow-lg group-hover:shadow-cyan-500/50 transition-transform duration-200 rounded-md overflow-hidden bg-black/20 p-1`}>
                      {square.type === "property" && <PropertyCard square={square} owner={propertyOwner(square.id)} />}
                      {["community_chest", "chance", "luxury_tax", "income_tax"].includes(square.type) && <SpecialCard square={square} />}
                      {square.type === "corner" && <CornerCard square={square} />}

                      {square.type === "property" && devLevel > 0 && (
                        <div className="absolute top-1 right-1 bg-yellow-500 text-black text-xs font-bold rounded px-1 z-20 flex items-center gap-0.5">
                          {devLevel === 5 ? '🏨' : `🏠 ${devLevel}`}
                        </div>
                      )}

                      <div className="absolute bottom-1 left-1 flex flex-wrap gap-2 z-10">
                        {playersHere.map((p) => {
                          const isCurrent = p.user_id === game.next_player_id;
                          return (
                            <motion.span
                              key={p.user_id}
                              title={`${p.username} (${p.balance})`}
                              className={`text-xl md:text-2xl lg:text-3xl border-2 rounded ${isCurrent ? 'border-cyan-300' : 'border-transparent'}`}
                              animate={{
                                y: isCurrent ? [0, -8, 0] : [0, -3, 0],
                                scale: isCurrent ? [1, 1.1, 1] : 1,
                                rotate: isCurrent ? [0, 5, -5, 0] : 0,
                              }}
                              transition={{
                                repeat: Infinity,
                                duration: isCurrent ? 1.2 : 2,
                              }}
                              whileHover={{ scale: 1.2, y: -2 }}
                            >
                              {getPlayerSymbol(p.symbol)}
                            </motion.span>
                          );
                        })}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>

        <Toaster
          position="top-center"
          reverseOrder={false}
          gutter={12}
          containerClassName="z-50"
          toastOptions={{
            duration: 3000,
            style: {
              background: "rgba(15, 23, 42, 0.95)",
              color: "#fff",
              border: "1px solid rgba(34, 211, 238, 0.3)",
              borderRadius: "12px",
              padding: "12px 20px",
              fontSize: "16px",
              fontWeight: "600",
              boxShadow: "0 10px 30px rgba(0, 255, 255, 0.15)",
              backdropFilter: "blur(10px)",
            },
            success: { icon: "✔", style: { borderColor: "#10b981" } },
            error: { icon: "✖", style: { borderColor: "#ef4444" } },
          }}
        />
      </div>
    </ErrorBoundary>
  );
};

export default GameBoard;