'use client';
import { House } from 'lucide-react';
import { useRouter } from 'next/navigation';
import React, { useState, useEffect } from 'react';
import { FaUser } from 'react-icons/fa6';
import { IoIosAddCircle } from 'react-icons/io';
import { IoKey } from 'react-icons/io5';
import { RxDotFilled } from 'react-icons/rx';
import { IoIosArrowDown, IoIosArrowUp } from 'react-icons/io'; // Icons for dropdown toggle

// Define settings interface
interface GameSettings {
  auction: number;
  even_build: number;
  mortgage: number;
  randomize_play_order: number;
  rent_in_prison: number;
  starting_cash: number;
}

// Define game interface with settings
interface Game {
  id: number;
  code: string;
  mode: 'PUBLIC' | 'PRIVATE';
  status: string;
  number_of_players: number; // maxPlayers
  players_joined?: number; // Populated from API
  creator_id?: number;
  settings?: GameSettings; // Add settings to the interface
  created_at?: string;
}

const JoinRoom = () => {
  const router = useRouter();
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inputCode, setInputCode] = useState<string>('');
  const [expandedGame, setExpandedGame] = useState<string | null>(null); // Track expanded game by code

  useEffect(() => {
    const fetchGames = async () => {
      try {
        const response = await fetch('https://base-monopoly-production.up.railway.app/api/games?status=PENDING');
        if (!response.ok) {
          throw new Error(`Failed to fetch games: ${response.status} ${response.statusText}`);
        }
        const data: Game[] = await response.json();
        console.log('Fetched all pending games:', data);
        setGames(data);
      } catch (err: any) {
        console.error('Error fetching games:', err);
        setError(err.message);
        setGames([]);
      } finally {
        setLoading(false);
      }
    };

    fetchGames();
  }, []);

  const handleJoinByCode = async (code: string) => {
    try {
      const response = await fetch(`https://base-monopoly-production.up.railway.app/api/games/code/${code}`);
      if (!response.ok) {
        throw new Error(`Game ${code} not found: ${response.status} ${response.statusText}`);
      }
      const gameData = await response.json();
      if (gameData.status !== 'PENDING') {
        throw new Error(`Game ${code} has already started or ended.`);
      }
      router.push(`/game-waiting?gameCode=${code}`);
    } catch (err: any) {
      console.error('Error verifying game code:', err);
      alert(err.message);
    }
  };

  const handleCreateRoom = () => {
    router.push('/game-settings');
  };

  const handleInputJoin = () => {
    if (inputCode.trim()) {
      handleJoinByCode(inputCode.trim().toUpperCase());
    }
  };

  // Toggle dropdown for a specific game
  const toggleSettings = (code: string) => {
    setExpandedGame(expandedGame === code ? null : code);
  };

  // Helper to render player indicators
  const renderIndicators = (game: Game) => {
    const playersJoined = game.players_joined || 1; // Fallback to 1 (creator)
    const maxPlayers = game.number_of_players;
    return (
      <span className="flex gap-1.5 text-[#263238]">
        {Array(playersJoined)
          .fill(0)
          .map((_, i) => (
            <FaUser key={`user-${i}`} className="text-[#F0F7F7]" />
          ))}
        {Array(maxPlayers - playersJoined)
          .fill(0)
          .map((_, i) => (
            <RxDotFilled key={`dot-${i}`} className="w-5 h-5" />
          ))}
      </span>
    );
  };

  // Helper for private indicator
  const renderPrivateIndicator = (game: Game) => (
    <span className="flex gap-1.5 text-[#263238] mt-2">
      {game.mode === 'PRIVATE' && <IoKey className="text-[#F0F7F7] w-5 h-5" />}
      {Array(game.number_of_players - 1)
        .fill(0)
        .map((_, i) => (
          <RxDotFilled key={`key-dot-${i}`} className="w-5 h-5" />
        ))}
    </span>
  );

  // Helper to render game settings
  const renderGameSettings = (settings?: GameSettings) => {
    if (!settings) return null;
    return (
      <div className="text-[#869298] text-[14px] font-dmSans mt-2">
        <p>
          <strong>Auction:</strong> {settings.auction ? 'Enabled' : 'Disabled'}
        </p>
        <p>
          <strong>Even Build:</strong> {settings.even_build ? 'Enabled' : 'Disabled'}
        </p>
        <p>
          <strong>Mortgage:</strong> {settings.mortgage ? 'Enabled' : 'Disabled'}
        </p>
        <p>
          <strong>Randomize Play Order:</strong> {settings.randomize_play_order ? 'Enabled' : 'Disabled'}
        </p>
        <p>
          <strong>Rent in Prison:</strong> {settings.rent_in_prison ? 'Enabled' : 'Disabled'}
        </p>
        <p>
          <strong>Starting Cash:</strong> ${settings.starting_cash}
        </p>
      </div>
    );
  };

  if (loading) {
    return (
      <section className="w-full min-h-screen bg-settings bg-cover bg-fixed bg-center flex items-center justify-center">
        <p className="text-[#00F0FF] font-orbitron text-lg">Loading games...</p>
      </section>
    );
  }

  return (
    <section className="w-full min-h-screen bg-settings bg-cover bg-fixed bg-center">
      <main className="w-full min-h-screen py-20 flex flex-col items-center justify-start bg-[#010F101F] backdrop-blur-[12px] px-4">
        <div className="w-full flex flex-col items-center">
          <h2 className="text-[#F0F7F7] font-orbitron md:text-[24px] text-[20px] font-[700] text-center">
            Join Room
          </h2>
          <p className="text-[#869298] text-[16px] font-dmSans text-center">
            Select the room you would like to join
          </p>
        </div>
        {/* buttons */}
        <div className="w-full max-w-[792px] mt-10 flex justify-between items-center">
          <button
            type="button"
            onClick={() => router.push('/')}
            className="relative group w-[227px] h-[40px] bg-transparent border-none p-0 overflow-hidden cursor-pointer"
          >
            <svg
              width="227"
              height="40"
              viewBox="0 0 227 40"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="absolute top-0 left-0 w-full h-full"
            >
              <path
                d="M6 1H221C225.373 1 227.996 5.85486 225.601 9.5127L207.167 37.5127C206.151 39.0646 204.42 40 202.565 40H6C2.96244 40 0.5 37.5376 0.5 34.5V6.5C0.5 3.46243 2.96243 1 6 1Z"
                fill="#0E1415"
                stroke="#003B3E"
                strokeWidth={1}
                className="group-hover:stroke-[#00F0FF] transition-all duration-300 ease-in-out"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[#0FF0FC] capitalize text-[13px] font-dmSans font-medium z-10">
              <House className="mr-1 w-[14px] h-[14px]" />
              Go Back Home
            </span>
          </button>
          <button
            type="button"
            onClick={handleCreateRoom}
            className="relative group w-[227px] h-[40px] bg-transparent border-none p-0 overflow-hidden cursor-pointer"
          >
            <svg
              width="227"
              height="40"
              viewBox="0 0 227 40"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="absolute top-0 left-0 w-full h-full transform scale-x-[-1] scale-y-[-1]"
            >
              <path
                d="M6 1H221C225.373 1 227.996 5.85486 225.601 9.5127L207.167 37.5127C206.151 39.0646 204.42 40 202.565 40H6C2.96244 40 0.5 37.5376 0.5 34.5V6.5C0.5 3.46243 2.96243 1 6 1Z"
                fill="#003B3E"
                stroke="#003B3E"
                strokeWidth={1}
                className="group-hover:stroke-[#00F0FF] transition-all duration-300 ease-in-out"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[#00F0FF] capitalize text-[12px] font-dmSans font-medium z-10">
              <IoIosAddCircle className="mr-1 w-[14px] h-[14px]" />
              Create New Room
            </span>
          </button>
        </div>
        {/* rooms */}
        <div className="w-full max-w-[792px] mt-10 bg-[#010F10] rounded-[12px] border-[1px] border-[#003B3E] md:px-20 px-6 py-12 flex flex-col gap-4">
          {error ? (
            <p className="text-[#FF6B6B] text-center">{error}</p>
          ) : games.length === 0 ? (
            <p className="text-[#869298] text-center">
              No pending games available. Create one to start playing!
            </p>
          ) : (
            games.map((game) => (
              <div
                key={game.code}
                className="w-full p-4 border-[1px] flex flex-col items-start border-[#0E282A] rounded-[12px] cursor-pointer hover:border-[#00F0FF]"
              >
                <div
                  className="w-full flex justify-between items-center"
                  onClick={() => toggleSettings(game.code)}
                >
                  <h4 className="text-[#F0F7F7] text-[20px] uppercase font-dmSans font-[800]">
                    {game.code}
                  </h4>
                  <div className="flex items-center gap-4">
                    {renderIndicators(game)}
                    {expandedGame === game.code ? (
                      <IoIosArrowUp className="text-[#F0F7F7] w-5 h-5" />
                    ) : (
                      <IoIosArrowDown className="text-[#F0F7F7] w-5 h-5" />
                    )}
                  </div>
                </div>
                {renderPrivateIndicator(game)}
                <p className="text-[#869298] text-[14px] font-dmSans mt-2">
                  <strong>Players Joined:</strong> {/* Placeholder for players joined */}
                </p>
                {expandedGame === game.code && (
                  <div className="mt-2 w-full">
                    <div className="text-[#869298] text-[14px] font-dmSans">
                      <p>
                        <strong>Mode:</strong> {game.mode}
                      </p>
                      <p>
                        <strong>Created:</strong>{' '}
                        {game.created_at ? new Date(game.created_at).toLocaleString() : 'N/A'}
                      </p>
                    </div>
                    {renderGameSettings(game.settings)}
                    <button
                      type="button"
                      onClick={() => handleJoinByCode(game.code)}
                      className="relative group w-[150px] h-[40px] bg-transparent border-none p-0 overflow-hidden cursor-pointer mt-4"
                    >
                      <svg
                        width="150"
                        height="40"
                        viewBox="0 0 150 40"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        className="absolute top-0 left-0 w-full h-full transform scale-x-[-1]"
                      >
                        <path
                          d="M6 1H144C148.373 1 150.996 5.85486 148.601 9.5127L130.167 37.5127C129.151 39.0646 127.42 40 125.565 40H6C2.96244 40 0.5 37.5376 0.5 34.5V6.5C0.5 3.46243 2.96243 1 6 1Z"
                          fill="#00F0FF"
                          stroke="#0E282A"
                          strokeWidth={1}
                        />
                      </svg>
                      <span className="absolute inset-0 flex items-center justify-center text-[#010F10] capitalize text-[14px] font-orbitron font-[700] z-10">
                        Join Room
                      </span>
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
          <div className="w-full h-[52px] flex mt-8">
            <input
              type="text"
              placeholder="Input room code"
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value)}
              className="w-full h-full px-4 text-[#73838B] border-[1px] border-[#0E282A] rounded-[12px] flex-1 outline-none focus:border-[#00F0FF]"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleInputJoin();
                }
              }}
            />
            <button
              type="button"
              onClick={handleInputJoin}
              className="relative group w-[260px] h-[52px] bg-transparent border-none p-0 overflow-hidden cursor-pointer"
            >
              <svg
                width="260"
                height="52"
                viewBox="0 0 260 52"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="absolute top-0 left-0 w-full h-full transform scale-x-[-1]"
              >
                <path
                  d="M10 1H250C254.373 1 256.996 6.85486 254.601 10.5127L236.167 49.5127C235.151 51.0646 233.42 52 231.565 52H10C6.96244 52 4.5 49.5376 4.5 46.5V9.5C4.5 6.46243 6.96243 4 10 4Z"
                  fill="#00F0FF"
                  stroke="#0E282A"
                  strokeWidth={1}
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-[#010F10] capitalize text-[18px] -tracking-[2%] font-orbitron font-[700] z-10">
                Join Room
              </span>
            </button>
          </div>
        </div>
      </main>
    </section>
  );
};

export default JoinRoom;