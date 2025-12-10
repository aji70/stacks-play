import { register, getGame, createAiGame, isRegistered, getUser, User, getGameByCode, createGame, joinGame } from "@/lib/tycoon";
import { getStxBalance } from "@/lib/stx-utils";
import {
  connect,
  disconnect,
  getLocalStorage,
  isConnected,
  openContractCall,
} from "@stacks/connect";
import { PostConditionMode } from "@stacks/transactions";
import { useEffect, useState } from "react";

type UserData = {
  addresses: {
    stx: { address: string }[];
    btc: { address: string }[];
  };
};

type Network = "mainnet" | "testnet" | null;

    

export function useStacks() {
  const [userData, setUserData] = useState<UserData | null>(null);
  const [stxBalance, setStxBalance] = useState(0);
  const [network, setNetwork] = useState<Network>(null);
  const [tycoonUser, setTycoonUser] = useState<User | null>(null);

  function handleUserData(data: UserData | null) {
    if (data) {
      const stxAddress = data.addresses?.stx?.[0]?.address;
      if (stxAddress) {
        setNetwork(stxAddress.startsWith("SP") ? "mainnet" : "testnet");
        setUserData(data);
      }
    } else {
      setUserData(null);
      setNetwork(null);
      setTycoonUser(null);
    }
  }

  function connectWallet() {
    connect().then(() => {
      handleUserData(getLocalStorage());
    }).catch((error) => {
      console.error("Wallet connection failed:", error);
    });
  }

  function disconnectWallet() {
    disconnect();
    handleUserData(null);
    setStxBalance(0);
  }

async function handleRegister(username: string): Promise<string | undefined> {
  if (typeof window === "undefined") return;

  try {
    if (!userData || !network) throw new Error("User not connected");
    const txOptions = await register(network, username);

    return await new Promise<string | undefined>((resolve) => {
      openContractCall({
        ...txOptions,
        postConditionMode: PostConditionMode.Allow,
        onFinish: (data) => {
          console.log("TX sent:", data);
          window.alert("Sent register transaction");
          resolve(data.txId); // return the transaction ID
        },
        onCancel: () => {
          console.log("User canceled registration");
          resolve(undefined);
        },
      });
    });
  } catch (err: unknown) {
    console.error(err);
    const message = err instanceof Error ? err.message : String(err);
    window.alert(message);
    return undefined;
  }
}

async function handleGetGameByCode(gameCode: string) {
  if (!userData || !network) return null;
  return await getGameByCode(network, gameCode);
  
}


async function handleCreateAiGame(
  username: string,
  gameType: number,
  playerSymbol: number,
  numberOfAiPlayers: number,
  code: string,
  startingBalance: number
): Promise<string | undefined> {

  if (typeof window === "undefined") return;

  try {
    if (!userData || !network) throw new Error("User not connected");

    const txOptions = await createAiGame(
      network,
      username,
      gameType,
      playerSymbol,
      numberOfAiPlayers,
      code,
      startingBalance
    );

    return await new Promise<string | undefined>((resolve, reject) => {
      openContractCall({
        ...txOptions,
        postConditionMode: PostConditionMode.Allow,
        onFinish: (data) => {
          console.log("TX sent:", data);
          resolve(data.txId);   // ⭐ RETURN txId
        },
        onCancel: () => {
          console.log("User canceled");
          resolve(undefined);
        }
      });
    });

  } catch (err: unknown) {
    console.error(err);
    const message = err instanceof Error ? err.message : String(err);
    window.alert(message);
    return undefined;
  }
}

async function handleCreateGame(
  gameType: number,
  playerSymbol: number,
  numberOfPlayers: number,
  code: string,
  startingBalance: number,
  betAmount: number
): Promise<string | undefined> {

  if (typeof window === "undefined") return;

  try {
    if (!userData || !network) throw new Error("User not connected");

    const txOptions = await createGame(
      network,
      gameType,
      playerSymbol,
      numberOfPlayers,
      code,
      startingBalance,
      betAmount
    );

    return await new Promise<string | undefined>((resolve, reject) => {
      openContractCall({
        ...txOptions,
        postConditionMode: PostConditionMode.Allow,
        onFinish: (data) => {
          console.log("TX sent:", data);
          resolve(data.txId);   // ⭐ RETURN txId
        },
        onCancel: () => {
          console.log("User canceled");
          resolve(undefined);
        }
      });
    });

  } catch (err: unknown) {
    console.error(err);
    const message = err instanceof Error ? err.message : String(err);
    window.alert(message);
    return undefined;
  }
}

async function handleJoinGamee(
  gameId: number,
  playerSymbol: number,
): Promise<string | undefined> {

  if (typeof window === "undefined") return;

  try {
    if (!userData || !network) throw new Error("User not connected");

    const txOptions = await joinGame(
      network,
      gameId,
      playerSymbol,
    );

    return await new Promise<string | undefined>((resolve, reject) => {
      openContractCall({
        ...txOptions,
        postConditionMode: PostConditionMode.Allow,
        onFinish: (data) => {
          console.log("TX sent:", data);
          resolve(data.txId);   // ⭐ RETURN txId
        },
        onCancel: () => {
          console.log("User canceled");
          resolve(undefined);
        }
      });
    });

  } catch (err: unknown) {
    console.error(err);
    const message = err instanceof Error ? err.message : String(err);
    window.alert(message);
    return undefined;
  }
}


 

  async function checkIfRegistered(): Promise<boolean> {
    if (!userData || !network) return false;
    const address = userData.addresses.stx[0].address;
    return await isRegistered(network, address);
  }

  async function fetchUserInfo(): Promise<User | null> {
    if (!userData || !network) return null;
    const address = userData.addresses.stx[0].address;
    return await getUser(network, address);
  }

  async function fetchGameInfo(gameid: number) {
    if (!userData || !network) return null;
    return await getGame(network, gameid);
  } 

  useEffect(() => {
    if (isConnected()) {
      handleUserData(getLocalStorage());
    }
  }, []);

  useEffect(() => {
    if (userData) {
      const address = userData.addresses.stx[0].address;
      getStxBalance(address).then((balance) => {
        setStxBalance(balance);
      });

      // Fetch Tycoon user info
      fetchUserInfo().then(setTycoonUser);
    } else {
      setStxBalance(0);
      setTycoonUser(null);
    }
  }, [userData]);

  return {
    userData,
    stxBalance,
    network,
    tycoonUser,
    connectWallet,
    disconnectWallet,
    handleRegister,
    checkIfRegistered,
    fetchUserInfo,
    handleCreateAiGame,
    fetchGameInfo,
    handleGetGameByCode,
    handleCreateGame,
    handleJoinGamee,
  };
}