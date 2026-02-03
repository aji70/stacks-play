"use client";

import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Game, GameProperty, Player, Property } from "@/types/game";
import { useStacks } from "@/hooks/use-stacks";
import { getPlayerSymbol } from "@/lib/types/symbol";
import toast from "react-hot-toast";
import { apiClient } from "@/lib/api";
import { ApiResponse } from "@/types/api";

interface MobileGamePlayersProps {
  game: Game;
  properties: Property[];
  game_properties: GameProperty[];
  my_properties: Property[] | undefined;
  me: Player | null;
}

export default function MobileGamePlayers({
  game,
  properties,
  game_properties,
  my_properties = [],
  me,
}: MobileGamePlayersProps) {
  const { userData } = useStacks();
  const address = userData?.addresses?.stx?.[0]?.address;

  const [showEmpire, setShowEmpire] = useState(true);
  const [showTrades, setShowTrades] = useState(true);
  const [tradeRequests, setTradeRequests] = useState<any[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [tradeModal, setTradeModal] = useState<{ open: boolean; target: Player | null }>({
    open: false,
    target: null,
  });
  const [counterModal, setCounterModal] = useState<{ open: boolean; trade: any | null }>({
    open: false,
    trade: null,
  });
  const [aiTradePopup, setAiTradePopup] = useState<any | null>(null);
  const [aiResponsePopup, setAiResponsePopup] = useState<any | null>(null);

  const [offerProperties, setOfferProperties] = useState<number[]>([]);
  const [requestProperties, setRequestProperties] = useState<number[]>([]);
  const [offerCash, setOfferCash] = useState(0);
  const [requestCash, setRequestCash] = useState(0);

  const [openTrades, setOpenTrades] = useState<any[]>([]);
  const [incomingTrades, setIncomingTrades] = useState<any[]>([]);

  const processedAiTradeIds = useRef<Set<number>>(new Set());

  const isNext = me && game.next_player_id === me.user_id;

  const resetTradeFields = () => {
    setOfferCash(0);
    setRequestCash(0);
    setOfferProperties([]);
    setRequestProperties([]);
  };

  const isMortgaged = useCallback(
    (id: number) => game_properties.find((gp) => gp.property_id === id)?.mortgaged ?? false,
    [game_properties]
  );

  const developmentStage = useCallback(
    (id: number) => game_properties.find((gp) => gp.property_id === id)?.development ?? 0,
    [game_properties]
  );

  const rentPrice = useCallback(
    (id: number): number => {
      const p = properties.find((prop) => prop.id === id);
      if (!p) return 0;
      const dev = developmentStage(id);
      const rents = [
        p.rent_site_only,
        p.rent_one_house,
        p.rent_two_houses,
        p.rent_three_houses,
        p.rent_four_houses,
        p.rent_hotel,
      ];
      return rents[dev] ?? 0;
    },
    [properties, developmentStage]
  );

  const sortedPlayers = useMemo(
    () =>
      [...(game?.players ?? [])].sort(
        (a: Player, b: Player) => (a.turn_order ?? 99) - (b.turn_order ?? 99)
      ),
    [game?.players]
  );

  const toggleSelect = (
    id: number,
    arr: number[],
    setter: React.Dispatch<React.SetStateAction<number[]>>
  ) => {
    setter((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const startTrade = (p: Player) => {
    if (!isNext) {
      toast.error("Not your turn!");
      return;
    }
    setTradeModal({ open: true, target: p });
    resetTradeFields();
  };

  const calculateFavorability = useCallback(
    (trade: any) => {
      const offerValue =
        trade.offer_properties.reduce(
          (sum: number, id: number) =>
            sum + (properties.find((p) => p.id === id)?.price || 0),
          0
        ) + (trade.offer_amount || 0);

      const requestValue =
        trade.requested_properties.reduce(
          (sum: number, id: number) =>
            sum + (properties.find((p) => p.id === id)?.price || 0),
          0
        ) + (trade.requested_amount || 0);

      if (requestValue === 0) return 100;
      const ratio = ((offerValue - requestValue) / requestValue) * 100;
      return Math.min(100, Math.max(-100, Math.round(ratio)));
    },
    [properties]
  );

  const calculateAiFavorability = useCallback(
    (trade: any) => {
      const aiGetsValue =
        (trade.offer_amount || 0) +
        trade.offer_properties.reduce(
          (sum: number, id: number) =>
            sum + (properties.find((p) => p.id === id)?.price || 0),
          0
        );

      const aiGivesValue =
        (trade.requested_amount || 0) +
        trade.requested_properties.reduce(
          (sum: number, id: number) =>
            sum + (properties.find((p) => p.id === id)?.price || 0),
          0
        );

      if (aiGivesValue === 0) return 100;
      const ratio = ((aiGetsValue - aiGivesValue) / aiGivesValue) * 100;
      return Math.min(100, Math.max(-100, Math.round(ratio)));
    },
    [properties]
  );

  const fetchTrades = useCallback(async () => {
    if (!me || !game?.id) return;
    try {
      const [_initiated, _incoming] = await Promise.all([
        apiClient.get<ApiResponse<any[]>>(`/game-trade-requests/my/${game.id}/player/${me.user_id}`),
        apiClient.get<ApiResponse<any[]>>(`/game-trade-requests/incoming/${game.id}/player/${me.user_id}`),
      ]);

      const initiated = _initiated.data || [];
      const incoming = _incoming.data || [];

      setOpenTrades(initiated);
      setTradeRequests(incoming);

      const pendingAiTrades = incoming.filter((t: any) => {
        if (t.status !== "pending") return false;
        if (processedAiTradeIds.current.has(t.id)) return false;

        const fromPlayer = game.players.find((p: Player) => p.user_id === t.player_id);
        const username = (fromPlayer?.username || "").toLowerCase();
        const isAI =
          username.includes("ai_") ||
          username.includes("bot") ||
          username.includes("computer");

        return isAI;
      });

      if (pendingAiTrades.length > 0) {
        const trade = pendingAiTrades[0];
        setAiTradePopup(trade);
        processedAiTradeIds.current.add(trade.id);
      }
    } catch (err) {
      console.error("Error loading trades:", err);
      toast.error("Failed to load trades");
    }
  }, [me, game?.id, game.players]);

  useEffect(() => {
    if (!me || !game?.id) return;
    let isFetching = false;
    let interval: NodeJS.Timeout;

    const startPolling = async () => {
      await fetchTrades();
      interval = setInterval(async () => {
        if (isFetching) return;
        isFetching = true;
        try {
          await fetchTrades();
        } finally {
          isFetching = false;
        }
      }, 5000);
    };

    startPolling();
    return () => clearInterval(interval);
  }, [fetchTrades]);;

  useEffect(() => {
    processedAiTradeIds.current.clear();
  }, [game?.id]);

  const handleCreateTrade = async () => {
    if (!me || !tradeModal.target) return;

    const targetPlayer = tradeModal.target;
    const username = (targetPlayer.username || "").toLowerCase();
    const isAI = username.includes("ai_") || username.includes("bot") || username.includes("computer");

    try {
      const payload = {
        game_id: game.id,
        player_id: me.user_id,
        target_player_id: targetPlayer.user_id,
        offer_properties: offerProperties,
        offer_amount: offerCash,
        requested_properties: requestProperties,
        requested_amount: requestCash,
        status: "pending",
      };

      const res = await apiClient.post<ApiResponse<{ id?: number }>>("/game-trade-requests", payload);

      if (res.success) {
        toast.success("Trade sent successfully!");
        setTradeModal({ open: false, target: null });
        resetTradeFields();
        fetchTrades();

        if (isAI) {
          const sentTrade = {
            ...payload,
            id: res.data?.id || Date.now(),
          };

          const favorability = calculateAiFavorability(sentTrade);

          let decision: "accepted" | "declined" = "declined";
          let remark = "";

          if (favorability >= 30) {
            decision = "accepted";
            remark = "This is a fantastic deal! 🤖";
          } else if (favorability >= 10) {
            decision = Math.random() < 0.7 ? "accepted" : "declined";
            remark = decision === "accepted" ? "Fair enough, I'll take it." : "Not quite good enough.";
          } else if (favorability >= 0) {
            decision = Math.random() < 0.3 ? "accepted" : "declined";
            remark = decision === "accepted" ? "Okay, deal." : "Nah, too weak.";
          } else {
            remark = "This deal is terrible for me! 😤";
          }

          if (decision === "accepted") {
            try {
              await apiClient.post("/game-trade-requests/accept", { id: sentTrade.id });
              toast.success("AI accepted your trade instantly! 🎉");
              fetchTrades();
            } catch (err) {
              console.error("Auto-accept failed", err);
            }
          }

          setAiResponsePopup({
            trade: sentTrade,
            favorability,
            decision,
            remark,
          });
        }
      } else {
        toast.error(res.message || "Failed to create trade");
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to create trade");
    }
  };

   const handleTradeAction = async (id: number, action: "accepted" | "declined" | "counter") => {
    try {
      if (action === "counter") {
        const trade = tradeRequests.find((t) => t.id === id);
        if (trade) {
          setCounterModal({ open: true, trade });
          setOfferProperties(trade.requested_properties || []);
          setRequestProperties(trade.offer_properties || []);
          setOfferCash(trade.requested_amount || 0);
          setRequestCash(trade.offer_amount || 0);
        }
        return;
      }
      const res = await apiClient.post<ApiResponse>(
        `/game-trade-requests/${action === "accepted" ? "accept" : "decline"}`,
        { id }
      );
      if (res.success) {
        toast.success(`Trade ${action}`);
        setAiTradePopup(null);
        fetchTrades();
      } else {
        toast.error("Failed to update trade");
      }
    } catch (error) {
      toast.error("Failed to update trade");
    }
  };

   const submitCounterTrade = async () => {
    if (!me || !counterModal.trade) return;
    try {
      const payload = {
        offer_properties: offerProperties,
        offer_amount: offerCash,
        requested_properties: requestProperties,
        requested_amount: requestCash,
        status: "counter",
      };
      const res = await apiClient.put<ApiResponse>(`/game-trade-requests/${counterModal.trade.id}`, payload);
      if (res.success) {
        toast.success("Counter offer sent");
        setCounterModal({ open: false, trade: null });
        resetTradeFields();
        fetchTrades();
      } else {
        toast.error("Failed to send counter trade");
      }
    } catch (error) {
      toast.error("Failed to send counter trade");
    }
  };

  const handleDevelopment = async (id: number) => {
    if (!isNext || !me) return;
    try {
      const res = await apiClient.post<ApiResponse>("/game-properties/development", {
        game_id: game.id,
        user_id: me.user_id,
        property_id: id,
      });
      if (res.success) toast.success("Property developed successfully");
      else toast.error(res.message ?? "Failed to develop property");
    } catch (error: any) {
      toast.error(error?.message || "Failed to develop property");
    }
  };

  const handleDowngrade = async (id: number) => {
    if (!isNext || !me) return;
    try {
      const res = await apiClient.post<ApiResponse>("/game-properties/downgrade", {
        game_id: game.id,
        user_id: me.user_id,
        property_id: id,
      });
      if (res.success) toast.success("Property downgraded successfully");
      else toast.error(res.message ?? "Failed to downgrade property");
    } catch (error: any) {
      toast.error(error?.message || "Failed to downgrade property");
    }
  };

  const handleMortgage = async (id: number) => {
    if (!isNext || !me) return;
    try {
      const res = await apiClient.post<ApiResponse>("/game-properties/mortgage", {
        game_id: game.id,
        user_id: me.user_id,
        property_id: id,
      });
      if (res.success) toast.success("Property mortgaged successfully");
      else toast.error(res.message ?? "Failed to mortgage property");
    } catch (error: any) {
      toast.error(error?.message || "Failed to mortgage property");
    }
  };

  const handleUnmortgage = async (id: number) => {
    if (!isNext || !me) return;
    try {
      const res = await apiClient.post<ApiResponse>("/game-properties/unmortgage", {
        game_id: game.id,
        user_id: me.user_id,
        property_id: id,
      });
      if (res.success) toast.success("Property unmortgaged successfully");
      else toast.error(res.message ?? "Failed to unmortgage property");
    } catch (error: any) {
      toast.error(error?.message || "Failed to unmortgage property");
    }
  };


  return (
    <aside className="w-full h-full bg-gradient-to-b from-[#0a0e17] to-[#1a0033] overflow-y-auto relative">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-pink-500 via-cyan-400 to-purple-600 shadow-lg shadow-cyan-400/80" />
      <div className="p-3 space-y-4">
        <motion.h2
          animate={{ textShadow: ["0 0 10px #0ff", "0 0 20px #0ff", "0 0 10px #0ff"] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="text-xl font-bold text-cyan-300 text-center tracking-widest"
        >
          PLAYERS
        </motion.h2>

        {sortedPlayers.map((p: Player) => {
          const isMe = p.address?.toLowerCase() === address?.toLowerCase();
          const isTurn = p.user_id === game.next_player_id;
          const canTrade = isNext && !p.in_jail && !isMe;
          const displayName = p.username || p.address?.slice(0, 6) || "Player";
          const isAI = displayName.toLowerCase().includes("ai") || displayName.toLowerCase().includes("bot");

          return (
            <motion.div
              key={p.user_id}
              whileHover={{ scale: 1.02 }}
              className={`p-3 rounded-xl border-2 transition-all ${
                isTurn
                  ? "border-cyan-400 bg-cyan-900/40 shadow-lg shadow-cyan-400/60"
                  : "border-purple-800 bg-purple-900/20"
              }`}
            >
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{getPlayerSymbol(p.symbol)}</span>
                  <div className="font-bold text-cyan-200 text-sm">
                    {displayName}
                    {isMe && " (YOU)"}
                    {isAI && " (AI)"}
                  </div>
                </div>
                <div className="text-base font-bold text-yellow-400">
                  ${p.balance.toLocaleString()}
                </div>
              </div>
              {canTrade && (
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => startTrade(p)}
                  className="mt-2 w-full py-2 bg-gradient-to-r from-pink-600 to-purple-600 rounded-lg font-bold text-white shadow-lg text-sm"
                >
                  TRADE
                </motion.button>
              )}
            </motion.div>
          );
        })}

        <div className="border-t-4 border-purple-600 pt-3">
          <button
            onClick={() => setShowEmpire((v) => !v)}
            className="w-full text-lg font-bold text-purple-300 flex justify-between items-center"
          >
            <span>MY EMPIRE</span>
            <motion.span
              animate={{ rotate: showEmpire ? 180 : 0 }}
              transition={{ duration: 0.25 }}
              className="text-2xl text-cyan-400"
            >
              ▼
            </motion.span>
          </button>
          <AnimatePresence>
            {showEmpire && (
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: "auto" }}
                exit={{ height: 0 }}
                className="overflow-hidden mt-2 grid grid-cols-2 gap-2"
              >
                {my_properties.length > 0 ? (
                  my_properties.map((prop, i) => (
                    <motion.div
                      key={prop.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      onClick={() => isNext && setSelectedProperty(prop)}
                      whileHover={{ scale: 1.05 }}
                      className="bg-black/60 border-2 border-cyan-600 rounded-lg p-2 cursor-pointer shadow-md"
                    >
                      {prop.color && <div className="h-2 rounded" style={{ backgroundColor: prop.color }} />}
                      <div className="mt-1 text-xs font-bold text-cyan-200 truncate">{prop.name}</div>
                      <div className="text-xxs text-green-400">Rent: ${rentPrice(prop.id)}</div>
                      {isMortgaged(prop.id) && (
                        <div className="text-red-500 text-xxs mt-1 font-bold animate-pulse">MORTGAGED</div>
                      )}
                    </motion.div>
                  ))
                ) : (
                  <div className="col-span-2 text-center text-gray-500 py-8 text-sm">
                    No properties yet..
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="border-t-4 border-pink-600 pt-3">
          <button
            onClick={() => setShowTrades((v) => !v)}
            className="w-full text-lg font-bold text-pink-300 flex justify-between items-center"
          >
            <span>TRADES {incomingTrades.length > 0 && `(${incomingTrades.length} pending)`}</span>
            <motion.span animate={{ rotate: showTrades ? 180 : 0 }} className="text-2xl text-cyan-400">
              ▼
            </motion.span>
          </button>
          <AnimatePresence>
            {showTrades && incomingTrades.length > 0 && (
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: "auto" }}
                exit={{ height: 0 }}
                className="overflow-hidden mt-3 space-y-3"
              >
                {incomingTrades.map((trade: any) => {
                  const from = game.players.find((p: Player) => p.user_id === trade.player_id);
                  const offerProps = properties.filter((p: Property) => trade.offer_properties?.includes(p.id));
                  const requestProps = properties.filter((p: Property) => trade.requested_properties?.includes(p.id));

                  return (
                    <motion.div
                      key={trade.id}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="bg-gradient-to-br from-purple-900/60 to-cyan-900/40 border-2 border-cyan-500 rounded-xl p-4"
                    >
                      <div className="font-bold text-cyan-300 mb-2 text-sm">
                        From {from?.username || "Player"}
                      </div>
                      <div className="text-xs space-y-1 mb-3">
                        <div className="text-green-400">
                          Gives: {offerProps.length ? offerProps.map((p) => p.name).join(", ") : "nothing"} + ${trade.offer_amount || 0}
                        </div>
                        <div className="text-red-400">
                          Wants: {requestProps.length ? requestProps.map((p) => p.name).join(", ") : "nothing"} + ${trade.requested_amount || 0}
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        <button
                          onClick={() => handleTradeAction(trade.id, "accepted")}
                          className="py-1.5 bg-green-600 rounded text-xs font-bold text-white hover:bg-green-500"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => handleTradeAction(trade.id, "declined")}
                          className="py-1.5 bg-red-600 rounded text-xs font-bold text-white hover:bg-red-500"
                        >
                          Decline
                        </button>
                        <button
                          onClick={() => handleTradeAction(trade.id, "counter")}
                          className="py-1.5 bg-yellow-600 rounded text-xs font-bold text-black hover:bg-yellow-500"
                        >
                          Counter
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Property Action Modal */}
      <AnimatePresence>
        {isNext && selectedProperty && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-50 p-4"
            onClick={() => setSelectedProperty(null)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              onClick={(e) => e.stopPropagation()}
              className="relative bg-gradient-to-br from-purple-900 via-black to-cyan-900 rounded-2xl border-4 border-cyan-400 shadow-2xl p-6 w-full max-w-xs"
            >
              <button
                onClick={() => setSelectedProperty(null)}
                className="absolute top-3 right-3 text-2xl text-red-400 hover:text-red-300 transition"
              >
                X
              </button>
              <h3 className="text-2xl font-bold text-cyan-300 text-center mb-6">{selectedProperty.name}</h3>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => { handleDevelopment(selectedProperty.id); setSelectedProperty(null); }} className="py-3 bg-gradient-to-r from-green-600 to-emerald-700 rounded-xl font-bold text-white shadow-lg text-sm">BUILD</button>
                <button onClick={() => { handleDowngrade(selectedProperty.id); setSelectedProperty(null); }} className="py-3 bg-gradient-to-r from-orange-600 to-red-700 rounded-xl font-bold text-white shadow-lg text-sm">SELL</button>
                <button onClick={() => { handleMortgage(selectedProperty.id); setSelectedProperty(null); }} className="py-3 bg-gradient-to-r from-blue-600 to-indigo-700 rounded-xl font-bold text-white shadow-lg text-sm">MORTGAGE</button>
                <button onClick={() => { handleUnmortgage(selectedProperty.id); setSelectedProperty(null); }} className="py-3 bg-gradient-to-r from-purple-600 to-pink-700 rounded-xl font-bold text-white shadow-lg text-sm">REDEEM</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* AI Trade Popup */}
      <AnimatePresence>
        {aiTradePopup && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-50 p-4"
            onClick={() => setAiTradePopup(null)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              onClick={(e) => e.stopPropagation()}
              className="relative bg-gradient-to-br from-cyan-900 via-purple-900 to-pink-900 rounded-2xl border-4 border-cyan-400 shadow-2xl p-6 w-full max-w-sm"
            >
              <button
                onClick={() => setAiTradePopup(null)}
                className="absolute top-3 right-3 text-2xl text-red-300 hover:text-red-200 transition"
              >
                X
              </button>
              <h3 className="text-2xl font-bold text-cyan-300 text-center mb-5">
                🤖 AI Offer!
              </h3>
              <div className="text-center mb-6 bg-black/50 rounded-xl py-4 px-6">
                <p className="text-lg text-white mb-1">Deal rating:</p>
                <span className={`text-4xl font-bold ${calculateFavorability(aiTradePopup) >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {calculateFavorability(aiTradePopup) >= 0 ? "+" : ""}
                  {calculateFavorability(aiTradePopup)}%
                </span>
                <p className="text-sm text-gray-300 mt-2">
                  {calculateFavorability(aiTradePopup) >= 30 ? "🟢 Great!" : calculateFavorability(aiTradePopup) >= 0 ? "🟡 Okay" : "🔴 Bad"}
                </p>
              </div>
              <div className="space-y-3 text-sm mb-6">
                <div className="bg-green-900/60 rounded-lg p-3">
                  <span className="font-bold text-green-300">Gives:</span> {properties.filter((p) => aiTradePopup.offer_properties?.includes(p.id)).map((p) => p.name).join(", ") || "nothing"} {aiTradePopup.offer_amount > 0 && `+ $${aiTradePopup.offer_amount}`}
                </div>
                <div className="bg-red-900/60 rounded-lg p-3">
                  <span className="font-bold text-red-300">Wants:</span> {properties.filter((p) => aiTradePopup.requested_properties?.includes(p.id)).map((p) => p.name).join(", ") || "nothing"} {aiTradePopup.requested_amount > 0 && `+ $${aiTradePopup.requested_amount}`}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <button onClick={() => { handleTradeAction(aiTradePopup.id, "accepted"); setAiTradePopup(null); }} className="py-3 bg-green-600 rounded-xl font-bold text-white text-sm">ACCEPT</button>
                <button onClick={() => { handleTradeAction(aiTradePopup.id, "declined"); setAiTradePopup(null); }} className="py-3 bg-red-600 rounded-xl font-bold text-white text-sm">DECLINE</button>
                <button onClick={() => { handleTradeAction(aiTradePopup.id, "counter"); setAiTradePopup(null); }} className="py-3 bg-yellow-600 rounded-xl font-bold text-black text-sm">COUNTER</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* AI Response Popup */}
      <AnimatePresence>
        {aiResponsePopup && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-50 p-4"
            onClick={() => setAiResponsePopup(null)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              onClick={(e) => e.stopPropagation()}
              className="relative bg-gradient-to-br from-purple-900 via-indigo-900 to-cyan-900 rounded-2xl border-4 border-yellow-400 shadow-2xl p-6 w-full max-w-sm"
            >
              <button
                onClick={() => setAiResponsePopup(null)}
                className="absolute top-3 right-3 text-2xl text-red-300 hover:text-red-200 transition"
              >
                X
              </button>
              <h3 className="text-2xl font-bold text-yellow-300 text-center mb-5">
                🤖 AI Responds
              </h3>
              <div className="text-center mb-6 bg-black/50 rounded-xl py-4 px-6">
                <p className="text-lg text-white mb-1">Your offer was</p>
                <span className={`text-4xl font-bold ${aiResponsePopup.favorability >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {aiResponsePopup.favorability >= 0 ? "+" : ""}
                  {aiResponsePopup.favorability}%
                </span>
                <p className="text-lg text-white mt-2">for the AI</p>
              </div>
              <div className="text-center mb-6 text-3xl font-bold">
                {aiResponsePopup.decision === "accepted" ? "✅ ACCEPTED!" : "❌ DECLINED"}
              </div>
              <p className="text-center text-sm italic text-gray-300 mb-6">
                "{aiResponsePopup.remark}"
              </p>
              <button
                onClick={() => setAiResponsePopup(null)}
                className="w-full py-3 bg-gradient-to-r from-yellow-500 to-orange-600 rounded-xl font-bold text-black text-lg"
              >
                CLOSE
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Trade Modal - Create */}
      <TradeModal
        open={tradeModal.open}
        title="CREATE TRADE"
        onClose={() => { setTradeModal({ open: false, target: null }); resetTradeFields(); }}
        onSubmit={handleCreateTrade}
        my_properties={my_properties}
        properties={properties}
        game_properties={game_properties}
        offerProperties={offerProperties}
        requestProperties={requestProperties}
        setOfferProperties={setOfferProperties}
        setRequestProperties={setRequestProperties}
        offerCash={offerCash}
        requestCash={requestCash}
        setOfferCash={setOfferCash}
        setRequestCash={setRequestCash}
        toggleSelect={toggleSelect}
        targetPlayerAddress={tradeModal.target?.address}
      />

      {/* Trade Modal - Counter */}
      <TradeModal
        open={counterModal.open}
        title="COUNTER OFFER"
        onClose={() => { setCounterModal({ open: false, trade: null }); resetTradeFields(); }}
        onSubmit={submitCounterTrade}
        my_properties={my_properties}
        properties={properties}
        game_properties={game_properties}
        offerProperties={offerProperties}
        requestProperties={requestProperties}
        setOfferProperties={setOfferProperties}
        setRequestProperties={setRequestProperties}
        offerCash={offerCash}
        requestCash={requestCash}
        setOfferCash={setOfferCash}
        setRequestCash={setRequestCash}
        toggleSelect={toggleSelect}
        targetPlayerAddress={game.players.find(p => p.user_id === counterModal.trade?.target_player_id)?.address}
      />
    </aside>
  );
}

function TradeModal({
  open,
  title,
  onClose,
  onSubmit,
  my_properties,
  properties,
  game_properties,
  offerProperties,
  requestProperties,
  setOfferProperties,
  setRequestProperties,
  offerCash,
  requestCash,
  setOfferCash,
  setRequestCash,
  toggleSelect,
  targetPlayerAddress,
}: any) {
  const targetProps = useMemo(() => {
    if (!targetPlayerAddress) return [];
    return properties.filter((p: Property) =>
      game_properties.some((gp: GameProperty) => gp.property_id === p.id && gp.address === targetPlayerAddress)
    );
  }, [properties, game_properties, targetPlayerAddress]);

  if (!open) return null;

  const PropertyCard = ({ prop, isSelected, onClick }: { prop: Property; isSelected: boolean; onClick: () => void }) => (
    <div
      onClick={onClick}
      className={`p-3 rounded-lg border-2 cursor-pointer transition-all flex flex-col gap-2 relative overflow-hidden ${
        isSelected
          ? "border-cyan-400 bg-cyan-900/70 shadow-lg shadow-cyan-400/60"
          : "border-gray-700 hover:border-gray-500 bg-black/40"
      }`}
    >
      {isSelected && <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/20 to-purple-500/20 animate-pulse" />}
      {prop.color && (
        <div className="h-6 rounded-t-md -m-3 -mt-3 mb-2" style={{ backgroundColor: prop.color }} />
      )}
      <div className="text-xs font-bold text-cyan-200 text-center leading-tight relative z-10">{prop.name}</div>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/95 backdrop-blur-md flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95 }}
        animate={{ scale: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="relative bg-gradient-to-br from-purple-950 via-black to-cyan-950 rounded-2xl border-4 border-cyan-500 shadow-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto"
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-3xl text-red-400 hover:text-red-300 transition z-10">
          X
        </button>

        <h2 className="text-3xl font-bold text-cyan-300 text-center mb-8">{title}</h2>

        <div className="space-y-8">
          <div>
            <h3 className="text-2xl font-bold text-green-400 mb-4 text-center">YOU GIVE</h3>
            <div className="grid grid-cols-3 gap-3">
              {my_properties.map((p: Property) => (
                <PropertyCard
                  key={p.id}
                  prop={p}
                  isSelected={offerProperties.includes(p.id)}
                  onClick={() => toggleSelect(p.id, offerProperties, setOfferProperties)}
                />
              ))}
            </div>
            <input
              type="number"
              placeholder="+$ CASH"
              value={offerCash || ""}
              onChange={(e) => setOfferCash(Math.max(0, Number(e.target.value) || 0))}
              className="w-full mt-5 bg-black/60 border-2 border-green-500 rounded-lg px-4 py-4 text-green-400 font-bold text-2xl text-center placeholder-green-700"
            />
          </div>

          <div>
            <h3 className="text-2xl font-bold text-red-400 mb-4 text-center">YOU GET</h3>
            <div className="grid grid-cols-3 gap-3">
              {targetProps.length > 0 ? (
                targetProps.map((p: Property) => (
                  <PropertyCard
                    key={p.id}
                    prop={p}
                    isSelected={requestProperties.includes(p.id)}
                    onClick={() => toggleSelect(p.id, requestProperties, setRequestProperties)}
                  />
                ))
              ) : (
                <div className="col-span-3 text-center text-gray-500 py-8">
                  No properties available
                </div>
              )}
            </div>
            <input
              type="number"
              placeholder="+$ CASH"
              value={requestCash || ""}
              onChange={(e) => setRequestCash(Math.max(0, Number(e.target.value) || 0))}
              className="w-full mt-5 bg-black/60 border-2 border-red-500 rounded-lg px-4 py-4 text-red-400 font-bold text-2xl text-center placeholder-red-700"
            />
          </div>
        </div>

        <div className="flex flex-col gap-4 mt-10">
          <button onClick={onClose} className="w-full py-4 bg-gray-800 rounded-xl font-bold text-2xl text-gray-300 hover:bg-gray-700 transition">
            CANCEL
          </button>
          <button
            onClick={onSubmit}
            className="w-full py-4 bg-gradient-to-r from-cyan-500 to-purple-600 rounded-xl font-bold text-2xl text-white shadow-lg hover:shadow-cyan-500/50 transition"
          >
            SEND DEAL
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}