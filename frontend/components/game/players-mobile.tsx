"use client";

import React, { useState, useMemo, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Game, GameProperty, Player, Property } from "@/types/game";
import { useStacks } from "@/hooks/use-stacks";
import { getPlayerSymbol } from "@/lib/types/symbol";
import toast from "react-hot-toast";
import { apiClient } from "@/lib/api";
import { ApiResponse } from "@/types/api";
import { useMediaQuery } from "@/components/useMediaQuery";

interface GamePlayersProps {
  game: Game;
  properties: Property[];
  game_properties: GameProperty[];
  my_properties: Property[];
  me: Player | null;
}

/* ==================== Mobile Toggle Button (defined outside) ==================== */
const MobileToggleButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <motion.button
    whileTap={{ scale: 0.9 }}
    onClick={onClick}
    className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-gradient-to-r from-cyan-500 to-purple-600 text-white font-bold text-xl px-10 py-5 rounded-full shadow-2xl shadow-cyan-500/50"
  >
    PLAYERS & EMPIRE
  </motion.button>
);

/* ==================== Main Component ==================== */
export default function GamePlayers({
  game,
  properties,
  game_properties,
  my_properties,
  me,
}: GamePlayersProps) {
  const { userData } = useStacks();
  const address = userData?.addresses?.stx?.[0]?.address;
  const isMobile = useMediaQuery("(max-width: 1024px)");

  const [isOpen, setIsOpen] = useState(false);
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
        case 1: return property?.rent_one_house;
        case 2: return property?.rent_two_houses;
        case 3: return property?.rent_three_houses;
        case 4: return property?.rent_four_houses;
        case 5: return property?.rent_hotel;
        default: return property?.rent_site_only;
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

      // Fixed: .data is the array, not .data.data
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
      } else {
        toast.error(res.message || "Failed to create trade");
      }
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
      } else {
        toast.error("Failed to update trade");
      }
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
      } else {
        toast.error("Failed to send counter trade");
      }
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
      const payload = { game_id: game.id, user_id: me.user_id, property_id: id };
      const res = await apiClient.post<ApiResponse>("/game-properties/development", payload);
      if (res.success) toast.success("Property developed successfully");
      else toast.error(res.message ?? "Failed to develop property.");
    } catch (error: any) {
      toast.error(error?.message || "Failed to develop property.");
    }
  };

  const handleDowngrade = async (id: number) => {
    if (!isNext || !me) return;
    try {
      const payload = { game_id: game.id, user_id: me.user_id, property_id: id };
      const res = await apiClient.post<ApiResponse>("/game-properties/downgrade", payload);
      if (res.success) toast.success("Property downgraded successfully");
      else toast.error(res.message ?? "Failed to downgrade property.");
    } catch (error: any) {
      toast.error(error?.message || "Failed to downgrade property.");
    }
  };

  const handleMortgage = async (id: number) => {
    if (!isNext || !me) return;
    try {
      const payload = { game_id: game.id, user_id: me.user_id, property_id: id };
      const res = await apiClient.post<ApiResponse>("/game-properties/mortgage", payload);
      if (res.success) toast.success("Property mortgaged successfully");
      else toast.error(res.message ?? "Failed to mortgage property.");
    } catch (error: any) {
      toast.error(error?.message || "Failed to mortgage property.");
    }
  };

  const handleUnmortgage = async (id: number) => {
    if (!isNext || !me) return;
    try {
      const payload = { game_id: game.id, user_id: me.user_id, property_id: id };
      const res = await apiClient.post<ApiResponse>("/game-properties/unmortgage", payload);
      if (res.success) toast.success("Property unmortgaged successfully");
      else toast.error(res.message ?? "Failed to unmortgage property.");
    } catch (error: any) {
      toast.error(error?.message || "Failed to unmortgage property.");
    }
  };

  const content = (
    <div className={`h-full flex flex-col ${isMobile ? "pb-20" : ""}`}>
      <div className="p-5 space-y-6 overflow-y-auto flex-1">
        <motion.h2
          animate={{ textShadow: ["0 0 10px #0ff", "0 0 20px #0ff", "0 0 10px #0ff"] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="text-3xl font-bold text-cyan-300 text-center tracking-widest"
        >
          PLAYERS
        </motion.h2>

        {sortedPlayers.map((player) => {
          const isWinner = player.user_id === game.winner_id;
          const isNextTurn = player.user_id === game.next_player_id;
          const isMe = player.address?.toLowerCase() === address?.toLowerCase();
          const canTrade = isNext && !player.in_jail && !isMe;

          return (
            <motion.div
              key={player.user_id}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={`p-5 rounded-2xl border-3 transition-all ${
                isNextTurn
                  ? "border-cyan-400 bg-cyan-900/50 shadow-xl shadow-cyan-400/70"
                  : "border-purple-800 bg-purple-900/30"
              }`}
            >
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-4">
                  <span className="text-5xl">{getPlayerSymbol(player.symbol)}</span>
                  <div>
                    <div className="font-bold text-xl text-cyan-200">
                      {player.username || player.address?.slice(0, 8)}
                      {isMe && <span className="block text-sm text-green-400">YOU</span>}
                      {isWinner && " 👑"}
                    </div>
                  </div>
                </div>
                <div className="text-2xl font-bold text-yellow-400">
                  ${player.balance.toLocaleString()}
                </div>
              </div>

              {canTrade && (
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => startTrade(player)}
                  className="w-full py-3 bg-gradient-to-r from-pink-600 to-purple-600 rounded-xl font-bold text-xl text-white shadow-lg"
                >
                  TRADE
                </motion.button>
              )}
            </motion.div>
          );
        })}

        <div className="border-t-4 border-purple-600 pt-6">
          <button
            onClick={toggleEmpire}
            className="w-full text-2xl font-bold text-purple-300 flex justify-between items-center"
          >
            <span>MY EMPIRE</span>
            <motion.span
              animate={{ rotate: showEmpire ? 180 : 0 }}
              transition={{ duration: 0.25 }}
              className="text-4xl text-cyan-400"
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
                className="overflow-hidden mt-4 grid grid-cols-2 gap-4"
              >
                {my_properties.length > 0 ? (
                  my_properties.map((prop, i) => (
                    <motion.div
                      key={prop.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      onClick={() => setSelectedProperty(prop)}
                      whileTap={{ scale: 0.95 }}
                      className="bg-black/70 border-3 border-cyan-600 rounded-xl p-4 cursor-pointer shadow-xl"
                    >
                      {prop.color && (
                        <div className="h-4 rounded-t-xl -m-4 -mt-4 mb-3" style={{ backgroundColor: prop.color }} />
                      )}
                      <div className="text-lg font-bold text-cyan-200 truncate">{prop.name}</div>
                      <div className="text-sm text-green-400 mt-1">Rent: ${rentPrice(prop.id)}</div>
                      {isMortgaged(prop.id) && (
                        <div className="text-red-500 text-sm mt-2 font-bold animate-pulse">MORTGAGED</div>
                      )}
                    </motion.div>
                  ))
                ) : (
                  <div className="col-span-2 text-center text-gray-400 py-8 text-lg">
                    No properties yet..
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="border-t-4 border-pink-600 pt-6 pb-20">
          <button
            onClick={toggleTrade}
            className="w-full text-2xl font-bold text-pink-300 flex justify-between items-center"
          >
            <span>TRADES {tradeRequests.length > 0 && `(${tradeRequests.length})`}</span>
            <motion.span
              animate={{ rotate: showTrade ? 180 : 0 }}
              transition={{ duration: 0.25 }}
              className="text-4xl text-cyan-400"
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
                className="overflow-hidden mt-5 space-y-6"
              >
                {openTrades.length > 0 && (
                  <div>
                    <h4 className="text-2xl font-bold text-cyan-400 mb-4 flex items-center gap-2">
                      <span>📤</span>
                      <span>MY ACTIVE TRADES</span>
                    </h4>
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
                          className="bg-gradient-to-br from-purple-900/60 to-cyan-900/40 border-3 border-cyan-500 rounded-2xl p-6 mb-5"
                        >
                          <div className="font-bold text-xl text-cyan-300 mb-3">
                            With {targetPlayer?.username || targetPlayer?.address?.slice(0, 8)}
                          </div>
                          <div className="space-y-3 text-lg">
                            <div className="text-green-400">
                              Gives: {offeredProps.length ? offeredProps.map((p) => p.name).join(", ") : "nothing"} + ${trade.offer_amount || 0}
                            </div>
                            <div className="text-red-400">
                              Wants: {requestedProps.length ? requestedProps.map((p) => p.name).join(", ") : "nothing"} + ${trade.requested_amount || 0}
                            </div>
                          </div>
                          <div className={`mt-4 px-4 py-2 rounded-lg text-center font-bold ${
                            trade.status === "accepted" ? "bg-green-900/50 text-green-300" :
                            trade.status === "declined" ? "bg-red-900/50 text-red-300" :
                            "bg-yellow-900/50 text-yellow-300"
                          }`}>
                            {trade.status.toUpperCase()}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}

                {tradeRequests.length > 0 && (
                  <div>
                    <h4 className="text-2xl font-bold text-cyan-400 mb-4 flex items-center gap-2">
                      <span>📥</span>
                      <span>INCOMING REQUESTS</span>
                    </h4>
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
                          className="bg-gradient-to-br from-purple-900/60 to-cyan-900/40 border-3 border-cyan-500 rounded-2xl p-6 mb-5"
                        >
                          <div className="font-bold text-xl text-cyan-300 mb-3">
                            From {fromPlayer?.username || fromPlayer?.address?.slice(0, 8)}
                          </div>
                          <div className="space-y-3 text-lg">
                            <div className="text-green-400">
                              Gives: {offeredProps.length ? offeredProps.map((p) => p.name).join(", ") : "nothing"} + ${trade.offer_amount || 0}
                            </div>
                            <div className="text-red-400">
                              Wants: {requestedProps.length ? requestedProps.map((p) => p.name).join(", ") : "nothing"} + ${trade.requested_amount || 0}
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-3 mt-5">
                            <button
                              onClick={() => handleTradeAction(trade.id, "accepted")}
                              className="py-3 bg-green-600 rounded-xl font-bold text-white text-lg"
                            >
                              ACCEPT
                            </button>
                            <button
                              onClick={() => handleTradeAction(trade.id, "declined")}
                              className="py-3 bg-red-600 rounded-xl font-bold text-white text-lg"
                            >
                              DECLINE
                            </button>
                            <button
                              onClick={() => handleTradeAction(trade.id, "counter")}
                              className="py-3 bg-yellow-600 rounded-xl font-bold text-black text-lg"
                            >
                              COUNTER
                            </button>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}

                {openTrades.length === 0 && tradeRequests.length === 0 && (
                  <div className="text-center text-gray-500 py-12">
                    <div className="text-6xl mb-4">💱</div>
                    <p className="text-xl">No trades yet..</p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );

  if (!isMobile) {
    return (
      <aside className="w-96 h-full bg-gradient-to-b from-[#0a0e17] to-[#1a0033] border-l-4 border-cyan-500 shadow-2xl overflow-y-auto relative">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-pink-500 via-cyan-400 to-purple-600 shadow-lg" />
        {content}

        <AnimatePresence>
          {isNext && selectedProperty && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50 p-4"
              onClick={() => setSelectedProperty(null)}
            >
              <motion.div
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                onClick={(e) => e.stopPropagation()}
                className="relative bg-gradient-to-br from-purple-900 to-cyan-900 rounded-2xl border-4 border-cyan-400 shadow-2xl p-8 max-w-md w-full"
              >
                <button
                  onClick={() => setSelectedProperty(null)}
                  className="absolute top-4 right-4 text-3xl text-red-400 hover:text-red-300"
                >
                  ×
                </button>
                <h3 className="text-3xl font-bold text-cyan-300 text-center mb-8">{selectedProperty.name}</h3>
                <div className="grid grid-cols-2 gap-4">
                  <button onClick={() => { handleDevelopment(selectedProperty.id); setSelectedProperty(null); }} className="py-4 bg-green-600 rounded-xl font-bold text-white text-xl shadow-lg">BUILD</button>
                  <button onClick={() => { handleDowngrade(selectedProperty.id); setSelectedProperty(null); }} className="py-4 bg-orange-600 rounded-xl font-bold text-white text-xl shadow-lg">SELL</button>
                  <button onClick={() => { handleMortgage(selectedProperty.id); setSelectedProperty(null); }} className="py-4 bg-blue-600 rounded-xl font-bold text-white text-xl shadow-lg">MORTGAGE</button>
                  <button onClick={() => { handleUnmortgage(selectedProperty.id); setSelectedProperty(null); }} className="py-4 bg-purple-600 rounded-xl font-bold text-white text-xl shadow-lg">REDEEM</button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </aside>
    );
  }

  return (
    <>
      <MobileToggleButton onClick={() => setIsOpen(true)} />

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 max-h-[90vh] bg-gradient-to-b from-[#0a0e17] to-[#1a0033] rounded-t-3xl border-t-4 border-cyan-500 shadow-2xl z-50 overflow-hidden"
            >
              <div className="flex justify-center pt-4 pb-2">
                <div className="w-20 h-2 bg-cyan-500 rounded-full" />
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="absolute top-6 right-6 text-4xl text-red-400"
              >
                ×
              </button>
              <div className="h-full overflow-y-auto">
                {content}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isNext && selectedProperty && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-end justify-center z-50 p-4"
            onClick={() => setSelectedProperty(null)}
          >
            <motion.div
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="relative bg-gradient-to-t from-purple-900 to-cyan-900 rounded-t-3xl border-t-4 border-cyan-400 shadow-2xl p-8 w-full max-w-lg"
            >
              <button
                onClick={() => setSelectedProperty(null)}
                className="absolute top-4 right-4 text-3xl text-red-400"
              >
                ×
              </button>
              <h3 className="text-3xl font-bold text-cyan-300 text-center mb-8">{selectedProperty.name}</h3>
              <div className="grid grid-cols-2 gap-4">
                <button onClick={() => { handleDevelopment(selectedProperty.id); setSelectedProperty(null); }} className="py-5 bg-green-600 rounded-xl font-bold text-white text-xl shadow-lg">BUILD</button>
                <button onClick={() => { handleDowngrade(selectedProperty.id); setSelectedProperty(null); }} className="py-5 bg-orange-600 rounded-xl font-bold text-white text-xl shadow-lg">SELL</button>
                <button onClick={() => { handleMortgage(selectedProperty.id); setSelectedProperty(null); }} className="py-5 bg-blue-600 rounded-xl font-bold text-white text-xl shadow-lg">MORTGAGE</button>
                <button onClick={() => { handleUnmortgage(selectedProperty.id); setSelectedProperty(null); }} className="py-5 bg-purple-600 rounded-xl font-bold text-white text-xl shadow-lg">REDEEM</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <TradeModal
        open={tradeModal.open}
        title={`Trade with ${tradeModal.target?.username || "Player"}`}
        onClose={() => {
          setTradeModal({ open: false, target: null });
          resetTradeFields();
        }}
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
        title="Counter Offer"
        onClose={() => {
          setCounterModal({ open: false, trade: null });
          resetTradeFields();
        }}
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
        targetPlayerAddress={game.players.find((p) => p.user_id === counterModal.trade?.player_id)?.address}
      />
    </>
  );
}

/* ==================== Trade Modal ==================== */
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
    if (!targetPlayerAddress) return [];
    const ownedGameProps = game_properties.filter(
      (gp: GameProperty) => gp.address === targetPlayerAddress
    );
    return properties.filter((p: Property) =>
      ownedGameProps.some((gp: GameProperty) => gp.property_id === p.id)
    );
  }, [game_properties, properties, targetPlayerAddress]);

  if (!open) return null;

  const PropertyCard = ({ prop, isSelected, onClick }: { prop: Property; isSelected: boolean; onClick: () => void }) => (
    <div
      onClick={onClick}
      className={`p-4 rounded-xl border-3 cursor-pointer transition-all flex flex-col gap-2 ${
        isSelected
          ? "border-cyan-400 bg-cyan-900/60 shadow-2xl shadow-cyan-400/60"
          : "border-gray-600 hover:border-gray-400"
      }`}
    >
      {prop.color && (
        <div className="h-8 rounded-t-xl -m-4 -mt-4 mb-3" style={{ backgroundColor: prop.color }} />
      )}
      <div className="text-base font-bold text-cyan-200 text-center leading-tight">{prop.name}</div>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9 }}
        animate={{ scale: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="relative bg-gradient-to-br from-purple-900 to-black rounded-3xl border-4 border-cyan-500 shadow-2xl p-8 w-full max-w-5xl max-h-[90vh] overflow-y-auto"
      >
        <button onClick={onClose} className="absolute top-4 right-6 text-4xl text-red-400 hover:text-red-300 z-10">
          ×
        </button>

        <h2 className="text-4xl font-bold text-cyan-300 text-center mb-10">{title}</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <h3 className="text-3xl font-bold text-green-400 mb-6 text-center">YOU GIVE</h3>
            <div className="grid grid-cols-3 gap-4">
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
              placeholder="Cash Offer"
              value={offerCash || ""}
              onChange={(e) => setOfferCash(Math.max(0, Number(e.target.value) || 0))}
              className="w-full mt-8 bg-black/60 border-3 border-green-500 rounded-2xl px-6 py-5 text-green-400 font-bold text-3xl text-center placeholder-green-700"
            />
          </div>

          <div>
            <h3 className="text-3xl font-bold text-red-400 mb-6 text-center">YOU GET</h3>
            <div className="grid grid-cols-3 gap-4">
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
                <div className="col-span-3 text-center text-gray-500 py-12 text-xl">
                  No properties available
                </div>
              )}
            </div>
            <input
              type="number"
              placeholder="Cash Request"
              value={requestCash || ""}
              onChange={(e) => setRequestCash(Math.max(0, Number(e.target.value) || 0))}
              className="w-full mt-8 bg-black/60 border-3 border-red-500 rounded-2xl px-6 py-5 text-red-400 font-bold text-3xl text-center placeholder-red-700"
            />
          </div>
        </div>

        <div className="flex justify-center gap-8 mt-12">
          <button onClick={onClose} className="px-12 py-6 bg-gray-800 rounded-2xl font-bold text-3xl text-gray-300 hover:bg-gray-700">
            CANCEL
          </button>
          <button
            onClick={onSubmit}
            className="px-16 py-6 bg-gradient-to-r from-cyan-500 to-purple-600 rounded-2xl font-bold text-3xl text-white shadow-2xl hover:shadow-cyan-500/70"
          >
            SEND DEAL
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}