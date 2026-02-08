// entitlements.js
// v1: Web build is always FREE (no login/backend).
// Store wrappers can later override this by setting window.__PG_STORE__
// and injecting entitlement checks.

export const TIER = Object.freeze({
  FREE: "free",
  PRO: "pro"
});

// v1: web = free
export async function getTier() {
  // Later:
  // if (window.__PG_STORE__ === "google") return await getGooglePlayTier();
  // if (window.__PG_STORE__ === "microsoft") return await getMicrosoftTier();

  return TIER.FREE;
}

// Helper: boolean checks
export async function isPro() {
  return (await getTier()) === TIER.PRO;
}
