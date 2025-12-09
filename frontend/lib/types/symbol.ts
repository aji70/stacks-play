export interface PlayerSymbol {
  name: string;
  emoji: string;
  value: string;
  id: number;
}

export const symbols: PlayerSymbol[] = [
  { name: "Hat", emoji: "🎩", value: "hat", id: 1},
  { name: "Car", emoji: "🚗", value: "car", id: 2},
  { name: "Dog", emoji: "🐕", value: "dog", id: 3 },
  { name: "Thimble", emoji: "🧵", value: "thimble", id: 4 },
  { name: "Iron", emoji: "🧼", value: "iron", id: 5 },
  { name: "Battleship", emoji: "🚢", value: "battleship", id: 6 },
  { name: "Boot", emoji: "👞", value: "boot", id: 7},
  { name: "Wheelbarrow", emoji: "🛒", value: "wheelbarrow", id: 8},
];

export const getPlayerSymbolData = (value: string) => {
  return symbols.find((s) => s.value === value);
};

export const getPlayerSymbol = (value: string) => {
  const symbol = symbols.find((s) => s.value === value);
  return symbol?.emoji;
};
