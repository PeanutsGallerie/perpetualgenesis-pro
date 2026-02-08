// features.js
import { isPro } from "./entitlements.js";

export const FEATURES = {
  // examples — we’ll fill these with YOUR real rules
  maxBeds: { free: 6, pro: Infinity },
  maxPlans: { free: 3, pro: Infinity },
  exportPdf: { free: false, pro: true },
  advancedFilters: { free: false, pro: true }
};

export async function getFeature(name) {
  const pro = await isPro();
  const rule = FEATURES[name];
  if (!rule) return null;
  return pro ? rule.pro : rule.free;
}

export async function requireProOrExplain(featureName, message) {
  const pro = await isPro();
  if (pro) return true;

  alert(
    message ||
      "This is a Pro feature on the store version. The web version is Free."
  );
  return false;
}
