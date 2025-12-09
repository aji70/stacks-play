export function abbreviateAddress(address: string) {
  return `${address.substring(0, 5)}...${address.substring(36)}`;
}

export function abbreviateTxnId(txnId: string) {
  return `${txnId.substring(0, 5)}...${txnId.substring(62)}`;
}


export async function getStxBalance(address: string) {
  const baseUrl = "https://api.testnet.hiro.so";
  const url = `${baseUrl}/extended/v1/address/${address}/stx`;

  const response = await fetch(url).then((res) => res.json());
  const balance = parseInt(response.balance);
  return balance;
}