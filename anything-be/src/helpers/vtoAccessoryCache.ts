import { createHash } from "crypto";

export type AccessoryItemInput = {
  url: string;
  category: string;
  description?: string | null;
};

export type AccessoryCachedOutfit = {
  outfitId: number;
  downloadUrl?: string;
  gsUri?: string;
};

function normalizeAccessoryItem(item: AccessoryItemInput): string {
  // Normalize so ordering/whitespace doesn't cause cache misses.
  const url = (item.url || "").trim();
  const category = (item.category || "").trim().toLowerCase();
  const description = (item.description || "").trim();
  return `${category}|${url}|${description}`;
}

export function buildAccessoryTryOnCacheKey(args: {
  userId: number;
  topId: number;
  bottomId: number;
  shoesId: number;
  dressId: number;
  outerwearId: number;
  accessoryItems: AccessoryItemInput[];
}): string {
  const normalizedAccessory = [...args.accessoryItems]
    .map(normalizeAccessoryItem)
    .sort()
    .join("||");

  const signature = [
    `u=${args.userId}`,
    `top=${args.topId}`,
    `bottom=${args.bottomId}`,
    `shoes=${args.shoesId}`,
    `dress=${args.dressId}`,
    `outerwear=${args.outerwearId}`,
    `acc=${normalizedAccessory}`,
  ].join("|");

  return `vto:accessory-outfit:${createHash("sha256").update(signature).digest("hex")}`;
}

