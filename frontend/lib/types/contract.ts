import { STACKS_TESTNET, STACKS_MAINNET, StacksNetwork } from "@stacks/network"; // Added STACKS_MAINNET and StacksNetwork
import {
  BooleanCV,
  cvToValue,
  fetchCallReadOnlyFunction,
  ListCV,
  OptionalCV,
  PrincipalCV,
  TupleCV,
  uintCV,
  UIntCV,
} from "@stacks/transactions";

// REPLACE THESE WITH YOUR OWN (ensure testnet deployment!)
const CONTRACT_ADDRESS = "ST81CZF1YK81CPAMS6PRS3GJSKK35MGZ2VWEPSEN";
const CONTRACT_NAME = "tic-tac-toe";

type GameCV = {
  "player-one": PrincipalCV;
  "player-two": OptionalCV<PrincipalCV>;
  "is-player-one-turn": BooleanCV;
  "bet-amount": UIntCV;
  board: ListCV<UIntCV>;
  winner: OptionalCV<PrincipalCV>;
};

export type Game = {
  id: number;
  "player-one": string;
  "player-two": string | null;
  "is-player-one-turn": boolean;
  "bet-amount": number;
  board: number[];
  winner: string | null;
};

export enum Move {
  EMPTY = 0,
  X = 1,
  O = 2,
}

export const EMPTY_BOARD = [
  Move.EMPTY,
  Move.EMPTY,
  Move.EMPTY,
  Move.EMPTY,
  Move.EMPTY,
  Move.EMPTY,
  Move.EMPTY,
  Move.EMPTY,
  Move.EMPTY,
];

// Helper to get network object
function getNetwork(networkName: 'mainnet' | 'testnet' = 'testnet'): StacksNetwork {
  return networkName === 'mainnet' ? STACKS_MAINNET : STACKS_TESTNET;
}

export async function getAllGames(networkName: 'mainnet' | 'testnet' = 'testnet') {
  const network = getNetwork(networkName);
  // Fetch the latest-game-id from the contract
  const latestGameIdCV = (await fetchCallReadOnlyFunction({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: "get-latest-game-id",
    functionArgs: [],
    senderAddress: CONTRACT_ADDRESS,
    network,
  })) as UIntCV;

  // Convert the uintCV to a JS/TS number type
  const latestGameId = parseInt(latestGameIdCV.value.toString());

  // Loop from 0 to latestGameId-1 and fetch the game details for each game
  const games: Game[] = [];
  for (let i = 0; i < latestGameId; i++) {
    const game = await getGame(i, networkName);
    if (game) games.push(game);
  }
  return games;
}

export async function getGame(gameId: number, networkName: 'mainnet' | 'testnet' = 'testnet') {
  const network = getNetwork(networkName);
  // Use the get-game read only function to fetch the game details for the given gameId
  const gameDetails = await fetchCallReadOnlyFunction({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: "get-game",
    functionArgs: [uintCV(gameId)],
    senderAddress: CONTRACT_ADDRESS,
    network,
  });

  const responseCV = gameDetails as OptionalCV<TupleCV<GameCV>>;
  // If we get back a none, then the game does not exist and we return null
  if (responseCV.type === "none") return null;
  // If we get back a value that is not a tuple, something went wrong and we return null
  if (responseCV.value.type !== "tuple") return null;

  // If we got back a GameCV tuple, we can convert it to a Game object
  const gameCV = responseCV.value.value;

  const game: Game = {
    id: gameId,
    "player-one": gameCV["player-one"].value,
    "player-two":
      gameCV["player-two"].type === "some"
        ? gameCV["player-two"].value.value
        : null,
    "is-player-one-turn": cvToValue(gameCV["is-player-one-turn"]),
    "bet-amount": parseInt(gameCV["bet-amount"].value.toString()),
    board: gameCV.board.value.map((cell) => parseInt(cell.value.toString())),
    winner:
      gameCV["winner"].type === "some" ? gameCV["winner"].value.value : null,
  };
  return game;
}

export async function createNewGame(
  betAmount: number,
  moveIndex: number,
  move: Move,
  networkName: 'mainnet' | 'testnet' = 'testnet' // Optional param for flexibility
) {
  const txOptions = {
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: "create-game",
    functionArgs: [uintCV(betAmount), uintCV(moveIndex), uintCV(move)],
    network: networkName, // For the new @stacks/connect API
  };

  return txOptions;
}

export async function joinGame(
  gameId: number,
  moveIndex: number,
  move: Move,
  networkName: 'mainnet' | 'testnet' = 'testnet'
) {
  const txOptions = {
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: "join-game",
    functionArgs: [uintCV(gameId), uintCV(moveIndex), uintCV(move)],
    network: networkName,
  };

  return txOptions;
}

export async function play(
  gameId: number,
  moveIndex: number,
  move: Move,
  networkName: 'mainnet' | 'testnet' = 'testnet'
) {
  const txOptions = {
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: "play",
    functionArgs: [uintCV(gameId), uintCV(moveIndex), uintCV(move)],
    network: networkName,
  };

  return txOptions;
}