// pricing.js (load before the rest of the app)
window.PG_TIER = "pro"; // store build // web default

window.PG_RULES = {
  free: {
    maxBeds: 1,
    maxPlans: 1,
    maxCropsPerBed: 3,
    obstacles: true,
    spaceYield: true,
    spacingCompare: false,
    spacingSuccession: false,
    sharePlan: false,
    inventory: false,
    exportPrint: false,
    perpetualPlanner: false
  },
  pro: {
    maxBeds: Infinity,
    maxPlans: Infinity,
    maxCropsPerBed: Infinity,
    obstacles: true,
    spaceYield: true,
    spacingCompare: true,
    spacingSuccession: true,
    sharePlan: true,
    inventory: true,
    exportPrint: true,
    perpetualPlanner: true
  }
};

window.pgGetRule = function (key) {
  const tier = window.PG_TIER === "pro" ? "pro" : "free";
  return window.PG_RULES[tier][key];
};

window.pgRequire = function (key, message) {
  if (window.pgGetRule(key)) return true;
  alert(message || "This feature is available in the Pro store version.");
  return false;
};

window.pgLimit = function (key) {
  const v = window.pgGetRule(key);
  return typeof v === "number" ? v : (v === Infinity ? Infinity : 0);
};
