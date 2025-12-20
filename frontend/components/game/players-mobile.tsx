"use client";

import React, { useState, useMemo, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Game, GameProperty, Player, Property } from "@/types/game";
import { useStacks } from "@/hooks/use-stacks";
import { getPlayerSymbol } from "@/lib/types/symbol";
import toast from "react-hot-toast";
import { apiClient } from "@/lib/api";
import { ApiResponse } from "@/types/api";

interface GamePlayersProps {
  game: Game;
  properties: Property[];
  game_properties: GameProperty[];
  my_properties: Property[];
  me: Player | null;
}

export default function GamePlayers({
  game,
  properties,
  game_properties,
  my_properties,
  me,
}: GamePlayersProps) {
  const { userData } = useStacks();
  const address = userData?.addresses?.stx?.[0]?.address;

  const [showEmpire, setShowEmpire] = useState(false);
  const [showTrade, setShowTrade] = useState(false);
  const [openTrades, setOpenTrades] = useState<any[]>([]);
  const [tradeRequests, setTradeRequests] = useState<any[]>([]);
  const [tradeModal, setTradeModal] = useState<{ open: boolean; target: Player | null }>({
    open: false,
    target: null,
  });
  const [counterModal, setCounterModal] = useState<{ open: boolean; trade: any | null }>({
    open: false,
    trade: null,
  });

  const [offerProperties, setOfferProperties] = useState<number[]>([]);
  const [requestProperties, setRequestProperties] = useState<number[]>([]);
  const [offerCash, setOfferCash] = useState<number>(0);
  const [requestCash, setRequestCash] = useState<number>(0);

  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);

  const toggleEmpire = useCallback(() => setShowEmpire((p) => !p), []);
  const toggleTrade = useCallback(() => setShowTrade((p) => !p), []);
  const isNext = me && game.next_player_id === me.user_id;

  const resetTradeFields = () => {
    setOfferCash(0);
    setRequestCash(0);
    setOfferProperties([]);
    setRequestProperties([]);
  };

  const isMortgaged = useCallback(
    (property_id: number) =>
      game_properties.find((gp) => gp.property_id === property_id)?.mortgaged ?? false,
    [game_properties]
  );

  const developmentStage = useCallback(
    (property_id: number) =>
      game_properties.find((gp) => gp.property_id === property_id)?.development ?? 0,
    [game_properties]
  );

  const rentPrice = useCallback(
    (property_id: number) => {
      const property = properties.find((p) => p.id === property_id);
      const dev = developmentStage(property_id);
      switch (dev) {
        case 1:
          return property?.rent_one_house;
        case 2:
          return property?.rent_two_houses;
        case 3:
          return property?.rent_three_houses;
        case 4:
          return property?.rent_four_houses;
        case 5:
          return property?.rent_hotel;
        default:
          return property?.rent_site_only;
      }
    },
    [properties, developmentStage]
  );

  const sortedPlayers = useMemo(
    () =>
      [...(game?.players ?? [])].sort(
        (a, b) => (a.turn_order ?? Infinity) - (b.turn_order ?? Infinity)
      ),
    [game?.players]
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
    } catch (err) {
      console.error("Error loading trades:", err);
      toast.error("Failed to load trades");
    }
  }, [me, game?.id]);

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
  }, [fetchTrades, me, game?.id]);

  const handleCreateTrade = async () => {
    if (!me || !tradeModal.target) return;

    try {
      const payload = {
        game_id: game.id,
        player_id: me.user_id,
        target_player_id: tradeModal.target.user_id,
        offer_properties: offerProperties,
        offer_amount: offerCash,
        requested_properties: requestProperties,
        requested_amount: requestCash,
        status: "pending",
      };

      const res = await apiClient.post<ApiResponse>("/game-trade-requests", payload);
      if (res.success) {
        toast.success("Trade created successfully");
        setTradeModal({ open: false, target: null });
        resetTradeFields();
        fetchTrades();
        return;
      }
      toast.error(res.message || "Failed to create trade");
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || "Failed to create trade");
    }
  };

  const handleTradeAction = async (id: number, action: "accepted" | "declined" | "counter") => {
    try {
      if (action === "counter") {
        const trade = tradeRequests.find((t) => t.id === id);
        if (trade) setCounterModal({ open: true, trade });
        return;
      }
      const res = await apiClient.post<ApiResponse>(
        `/game-trade-requests/${action === "accepted" ? "accept" : "decline"}`,
        { id }
      );
      if (res.success) {
        toast.success(`Trade ${action}`);
        fetchTrades();
        return;
      }
      toast.error("Failed to update trade");
    } catch (error) {
      console.error(error);
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
        return;
      }
      toast.error("Failed to send counter trade");
    } catch (error) {
      console.error(error);
      toast.error("Failed to send counter trade");
    }
  };

  const toggleSelect = (id: number, arr: number[], setter: (val: number[]) => void) => {
    if (arr.includes(id)) setter(arr.filter((x) => x !== id));
    else setter([...arr, id]);
  };

  const startTrade = (targetPlayer: Player) => {
    if (!isNext) return;
    setTradeModal({ open: true, target: targetPlayer });
  };

  const handleDevelopment = async (id: number) => {
    if (!isNext || !me) return;

    try {
      const payload = {
        game_id: game.id,
        user_id: me.user_id,
        property_id: id,
      };

      const res = await apiClient.post<ApiResponse>("/game-properties/development", payload);
      if (res.success) {
        toast.success("Property development successfully");
        return;
      }
      toast.error(res.message ?? "Failed to develop property.");
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || "Failed to develop property..");
    }
  };

  const handleDowngrade = async (id: number) => {
    if (!isNext || !me) return;

    try {
      const payload = {
        game_id: game.id,
        user_id: me.user_id,
        property_id: id,
      };

      const res = await apiClient.post<ApiResponse>("/game-properties/downgrade", payload);
      if (res.success) {
        toast.success("Property downgraded successfully");
        return;
      }
      toast.error(res.message ?? "Failed to downgrade property.");
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || "Failed to downgrade property..");
    }
  };

  const handleMortgage = async (id: number) => {
    if (!isNext || !me) return;

    try {
      const payload = {
        game_id: game.id,
        user_id: me.user_id,
        property_id: id,
      };

      const res = await apiClient.post<ApiResponse>("/game-properties/mortgage", payload);
      if (res.success) {
        toast.success("Property mortgaged successfully");
        return;
      }
      toast.error(res.message ?? "Failed to mortgage property.");
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || "Failed to mortgage property..");
    }
  };

  const handleUnmortgage = async (id: number) => {
    if (!isNext || !me) return;

    try {
      const payload = {
        game_id: game.id,
        user_id: me.user_id,
        property_id: id,
      };

      const res = await apiClient.post<ApiResponse>("/game-properties/unmortgage", payload);
      if (res.success) {
        toast.success("Property unmortgaged successfully");
        return;
      }
      toast.error(res.message ?? "Failed to unmortgage property.");
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || "Failed to unmortgage property..");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0e17] to-[#1a0033] text-white overflow-y-auto">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-pink-500 via-cyan-400 to-purple-600 shadow-lg" />

      <div className="p-5 md:p-8 space-y-8">
        <motion.h2
          animate={{ textShadow: ["0 0 10px #0ff", "0 0 20px #0ff", "0 0 10px #0ff"] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="text-3xl md:text-4xl font-bold text-cyan-300 text-center tracking-widest"
        >
          PLAYERS
        </motion.h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {sortedPlayers.map((player) => {
            const isWinner = player.user_id === game.winner_id;
            const isNextTurn = player.user_id === game.next_player_id;
            const isMe = player.address?.toLowerCase() === address?.toLowerCase();
            const canTrade = isNext && !player.in_jail && !isMe;

            return (
              <motion.div
                key={player.user_id}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className={`p-6 rounded-2xl border-4 transition-all ${
                  isNextTurn
                    ? "border-cyan-400 bg-cyan-900/50 shadow-2xl shadow-cyan-400/70"
                    : "border-purple-800 bg-purple-900/30"
                }`}
              >
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center gap-4">
                    <span className="text-5xl md:text-6xl">{getPlayerSymbol(player.symbol)}</span>
                    <div>
                      <div className="font-bold text-xl md:text-2xl text-cyan-200">
                        {player.username || player.address?.slice(0, 8)}
                        {isMe && <span className="block text-sm text-green-400">YOU</span>}
                        {isWinner && " 👑"}
                      </div>
                    </div>
                  </div>
                  <div className="text-2xl md:text-3xl font-bold text-yellow-400">
                    ${player.balance.toLocaleString()}
                  </div>
                </div>

                {canTrade && (
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => startTrade(player)}
                    className="w-full py-4 bg-gradient-to-r from-pink-600 to-purple-600 rounded-xl font-bold text-xl md:text-2xl text-white shadow-xl"
                  >
                    TRADE
                  </motion.button>
                )}
              </motion.div>
            );
          })}
        </div>

        <div className="border-t-4 border-purple-600 pt-8">
          <button
            onClick={toggleEmpire}
            className="w-full text-2xl md:text-3xl font-bold text-purple-300 flex justify-between items-center"
          >
            <span>MY EMPIRE</span>
            <motion.span
              animate={{ rotate: showEmpire ? 180 : 0 }}
              transition={{ duration: 0.3 }}
              className="text-4xl md:text-5xl text-cyan-400"
            >
              ▼
            </motion.span>
          </button>

          <AnimatePresence>
            {showEmpire && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden mt-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5"
              >
                {my_properties.length > 0 ? (
                  my_properties.map((prop, index) => (
                    <motion.div
                      key={prop.id}
                      initial={{ opacity: 0, y: 30 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      onClick={() => setSelectedProperty(prop)}
                      whileTap={{ scale: 0.95 }}
                      className="bg-black/70 border-4 border-cyan-600 rounded-2xl p-5 cursor-pointer shadow-2xl"
                    >
                      {prop.color && (
                        <div className="h-6 rounded-t-2xl -m-5 -mt-5 mb-4" style={{ backgroundColor: prop.color }} />
                      )}
                      <div className="text-lg md:text-xl font-bold text-cyan-200 text-center truncate">{prop.name}</div>
                      <div className="text-base text-green-400 mt-2 text-center">Rent: ${rentPrice(prop.id)}</div>
                      {isMortgaged(prop.id) && (
                        <div className="text-red-500 text-sm mt-3 font-bold text-center animate-pulse">MORTGAGED</div>
                      )}
                    </motion.div>
                  ))
                ) : (
                  <div className="col-span-full text-center text-gray-400 py-16 text-xl">
                    No properties yet..
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="border-t-4 border-pink-600 pt-8">
          <button
            onClick={toggleTrade}
            className="w-full text-2xl md:text-3xl font-bold text-pink-300 flex justify-between items-center pb-4"
          >
            <span>
              TRADES
              {(tradeRequests.length > 0 || openTrades.length > 0) &&
                ` (${tradeRequests.length + openTrades.length} active)`}
            </span>
            <motion.span
              animate={{ rotate: showTrade ? 180 : 0 }}
              transition={{ duration: 0.3 }}
              className="text-4xl md:text-5xl text-cyan-400"
            >
              ▼
            </motion.span>
          </button>

          <AnimatePresence>
            {showTrade && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden space-y-12"
              >
                {/* MY ACTIVE TRADES - Always shown first and visible immediately on mobile */}
                <div>
                  <h4 className="text-2xl md:text-3xl font-bold text-cyan-400 mb-6 flex items-center gap-3">
                    <span>📤</span>
                    <span>MY ACTIVE TRADES</span>
                    {openTrades.length > 0 && <span className="ml-2 text-yellow-300">({openTrades.length})</span>}
                  </h4>

                  {openTrades.length > 0 ? (
                    <div className="space-y-6">
                      {openTrades.map((trade) => {
                        const offeredProps = properties.filter((p) =>
                          trade.offer_properties?.includes(p.id)
                        );
                        const requestedProps = properties.filter((p) =>
                          trade.requested_properties?.includes(p.id)
                        );
                        const targetPlayer = game.players.find(
                          (pl) => pl.user_id === trade.target_player_id
                        );

                        return (
                          <motion.div
                            key={trade.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-gradient-to-br from-purple-900/60 to-cyan-900/40 border-4 border-cyan-500 rounded-2xl p-6"
                          >
                            <div className="font-bold text-xl md:text-2xl text-cyan-300 mb-4">
                              With {targetPlayer?.username || targetPlayer?.address?.slice(0, 8)}
                            </div>
                            <div className="space-y-4 text-base md:text-lg">
                              <div className="text-green-400">
                                Gives: {offeredProps.length ? offeredProps.map((p) => p.name).join(", ") : "nothing"} + ${trade.offer_amount || 0}
                              </div>
                              <div className="text-red-400">
                                Wants: {requestedProps.length ? requestedProps.map((p) => p.name).join(", ") : "nothing"} + ${trade.requested_amount || 0}
                              </div>
                            </div>
                            <div className="mt-6 flex justify-between items-center">
                              <span className={`px-5 py-3 rounded-xl text-center font-bold text-lg ${
                                trade.status === 'accepted' ? "bg-green-900/50 text-green-300" :
                                trade.status === 'declined' ? "bg-red-900/50 text-red-300" :
                                "bg-yellow-900/50 text-yellow-300"
                              }`}>
                                {trade.status.toUpperCase()}
                              </span>
                              {trade.status === 'pending' && (
                                <button
                                  onClick={() => handleTradeAction(trade.id, "declined")}
                                  className="py-3 px-6 bg-red-600 rounded-xl font-bold text-white text-lg"
                                >
                                  CANCEL
                                </button>
                              )}
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center text-gray-500 py-8">
                      <p className="text-xl">No active trades</p>
                    </div>
                  )}
                </div>

                {/* INCOMING REQUESTS */}
                {tradeRequests.length > 0 && (
                  <div>
                    <h4 className="text-2xl md:text-3xl font-bold text-cyan-400 mb-6 flex items-center gap-3">
                      <span>📥</span>
                      <span>INCOMING REQUESTS</span>
                    </h4>
                    <div className="space-y-6">
                      {tradeRequests.map((trade) => {
                        const offeredProps = properties.filter((p) =>
                          trade.offer_properties?.includes(p.id)
                        );
                        const requestedProps = properties.filter((p) =>
                          trade.requested_properties?.includes(p.id)
                        );
                        const fromPlayer = game.players.find(
                          (pl) => pl.user_id === trade.player_id
                        );

                        return (
                          <motion.div
                            key={trade.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-gradient-to-br from-purple-900/60 to-cyan-900/40 border-4 border-cyan-500 rounded-2xl p-6"
                          >
                            <div className="font-bold text-xl md:text-2xl text-cyan-300 mb-4">
                              From {fromPlayer?.username || fromPlayer?.address?.slice(0, 8)}
                            </div>
                            <div className="space-y-4 text-base md:text-lg">
                              <div className="text-green-400">
                                Gives: {offeredProps.length ? offeredProps.map((p) => p.name).join(", ") : "nothing"} + ${trade.offer_amount || 0}
                              </div>
                              <div className="text-red-400">
                                Wants: {requestedProps.length ? requestedProps.map((p) => p.name).join(", ") : "nothing"} + ${trade.requested_amount || 0}
                              </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                              <button
                                onClick={() => handleTradeAction(trade.id, "accepted")}
                                className="py-4 bg-green-600 rounded-xl font-bold text-white text-lg md:text-xl"
                              >
                                ACCEPT
                              </button>
                              <button
                                onClick={() => handleTradeAction(trade.id, "declined")}
                                className="py-4 bg-red-600 rounded-xl font-bold text-white text-lg md:text-xl"
                              >
                                DECLINE
                              </button>
                              <button
                                onClick={() => handleTradeAction(trade.id, "counter")}
                                className="py-4 bg-yellow-600 rounded-xl font-bold text-black text-lg md:text-xl"
                              >
                                COUNTER
                              </button>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* EMPTY STATE - only when both sections are empty */}
                {openTrades.length === 0 && tradeRequests.length === 0 && (
                  <div className="text-center text-gray-500 py-20">
                    <div className="text-7xl mb-6">💱</div>
                    <p className="text-2xl">No trades yet..</p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {isNext && selectedProperty && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 backdrop-blur-xl flex items-end justify-center z-50 p-4"
            onClick={() => setSelectedProperty(null)}
          >
            <motion.div
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              exit={{ y: 100 }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="relative bg-gradient-to-t from-purple-900 to-cyan-900 rounded-t-3xl border-t-4 border-x-4 border-cyan-400 shadow-2xl p-8 w-full max-w-2xl"
            >
              <button
                onClick={() => setSelectedProperty(null)}
                className="absolute top-6 right-6 text-4xl text-red-400"
              >
                ×
              </button>
              <h3 className="text-3xl md:text-4xl font-bold text-cyan-300 text-center mb-10">{selectedProperty.name}</h3>
              <div className="grid grid-cols-2 gap-6">
                <button onClick={() => { handleDevelopment(selectedProperty.id); setSelectedProperty(null); }} className="py-6 bg-green-600 rounded-2xl font-bold text-white text-xl md:text-2xl shadow-xl">BUILD</button>
                <button onClick={() => { handleDowngrade(selectedProperty.id); setSelectedProperty(null); }} className="py-6 bg-orange-600 rounded-2xl font-bold text-white text-xl md:text-2xl shadow-xl">SELL</button>
                <button onClick={() => { handleMortgage(selectedProperty.id); setSelectedProperty(null); }} className="py-6 bg-blue-600 rounded-2xl font-bold text-white text-xl md:text-2xl shadow-xl">MORTGAGE</button>
                <button onClick={() => { handleUnmortgage(selectedProperty.id); setSelectedProperty(null); }} className="py-6 bg-purple-600 rounded-2xl font-bold text-white text-xl md:text-2xl shadow-xl">REDEEM</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <TradeModal
        open={tradeModal.open}
        title={`Trade with ${tradeModal.target?.username}`}
        onClose={() => setTradeModal({ open: false, target: null })}
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

      <TradeModal
        open={counterModal.open}
        title="Counter Trade Offer"
        onClose={() => setCounterModal({ open: false, trade: null })}
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
    </div>
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
  const targetOwnedProps = useMemo(() => {
    const ownedGameProps = game_properties.filter(
      (gp: any) => gp.address === targetPlayerAddress
    );

    return properties.filter((p: any) =>
      ownedGameProps.some((gp: any) => gp.property_id === p.id)
    );
  }, [game_properties, properties, targetPlayerAddress]);

  if (!open) return null;

  const PropertyCard = ({ prop, isSelected, onClick }: { prop: Property; isSelected: boolean; onClick: () => void }) => (
    <div
      onClick={onClick}
      className={`p-5 rounded-2xl border-4 cursor-pointer transition-all flex flex-col gap-3 ${
        isSelected
          ? "border-cyan-400 bg-cyan-900/70 shadow-2xl shadow-cyan-400/70"
          : "border-gray-700 hover:border-gray-500 bg-black/60"
      }`}
    >
      {prop.color && (
        <div className="h-12 rounded-t-2xl -m-5 -mt-5 mb-5" style={{ backgroundColor: prop.color }} />
      )}
      <div className="text-lg md:text-xl font-bold text-cyan-200 text-center leading-tight">{prop.name}</div>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/90 backdrop-blur-xl flex items-end justify-center z-50"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        className="relative bg-gradient-to-t from-purple-900 via-black to-cyan-900 rounded-t-3xl border-t-4 border-x-4 border-cyan-500 shadow-2xl w-full max-h-[95vh] overflow-y-auto"
      >
        <div className="sticky top-0 bg-black/80 backdrop-blur-lg p-6 border-b-4 border-cyan-500">
          <button onClick={onClose} className="absolute top-6 right-6 text-4xl text-red-400">
            ×
          </button>
          <h2 className="text-3xl md:text-4xl font-bold text-cyan-300 text-center pr-12">{title}</h2>
        </div>

        <div className="p-6 space-y-12 pb-20">
          <div>
            <h3 className="text-2xl md:text-3xl font-bold text-green-400 mb-6 text-center">YOU GIVE</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
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
              className="w-full mt-8 bg-black/70 border-4 border-green-500 rounded-2xl px-6 py-6 text-green-400 font-bold text-3xl text-center placeholder-green-700"
            />
          </div>

          <div>
            <h3 className="text-2xl md:text-3xl font-bold text-red-400 mb-6 text-center">YOU GET</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
              {targetOwnedProps.length > 0 ? (
                targetOwnedProps.map((p: Property) => (
                  <PropertyCard
                    key={p.id}
                    prop={p}
                    isSelected={requestProperties.includes(p.id)}
                    onClick={() => toggleSelect(p.id, requestProperties, setRequestProperties)}
                  />
                ))
              ) : (
                <div className="col-span-full text-center text-gray-500 py-12 text-xl">
                  No properties available
                </div>
              )}
            </div>
            <input
              type="number"
              placeholder="+$ CASH"
              value={requestCash || ""}
              onChange={(e) => setRequestCash(Math.max(0, Number(e.target.value) || 0))}
              className="w-full mt-8 bg-black/70 border-4 border-red-500 rounded-2xl px-6 py-6 text-red-400 font-bold text-3xl text-center placeholder-red-700"
            />
          </div>

          <div className="flex flex-col md:flex-row gap-6">
            <button onClick={onClose} className="flex-1 py-6 bg-gray-800 rounded-2xl font-bold text-3xl text-gray-300 hover:bg-gray-700">
              CANCEL
            </button>
            <button
              onClick={onSubmit}
              className="flex-1 py-6 bg-gradient-to-r from-cyan-500 to-purple-600 rounded-2xl font-bold text-3xl text-white shadow-2xl"
            >
              SEND DEAL
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}