import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: join(__dirname, ".env") });

import { createBaseClient } from "./lib/base-client.js";
import { PortfolioStore } from "./lib/portfolio-store.js";
import { CostTracker } from "./lib/cost-tracker.js";
import { registerCreatePlan } from "./tools/create-plan.js";
import { registerExecuteTrades } from "./tools/execute-trades.js";
import { registerCheckPortfolio } from "./tools/check-portfolio.js";
import { registerRebalance } from "./tools/rebalance.js";
import { registerHarvestYield } from "./tools/harvest-yield.js";
import { startAutonomousLoop } from "./services/autonomous-loop.js";
import { syncToSupabase } from "./lib/supabase-sync.js";
import type { PluginConfig, PluginContext } from "./lib/types.js";

let loopCleanup: (() => void) | null = null;

export default function register(api: any) {
  const config: PluginConfig = {
    privateKey: api.config?.privateKey ?? process.env.CLAWVAULT_PRIVATE_KEY ?? "",
    rpcUrl: api.config?.rpcUrl ?? process.env.BASE_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com",
    builderCode: api.config?.builderCode ?? process.env.BUILDER_CODE ?? "clawvault",
    rebalanceIntervalMinutes:
      api.config?.rebalanceIntervalMinutes ??
      (Number(process.env.REBALANCE_INTERVAL_MINUTES) || 60),
    rebalanceThresholdPercent:
      api.config?.rebalanceThresholdPercent ??
      (Number(process.env.REBALANCE_THRESHOLD_PERCENT) || 5),
    managementFeeBps:
      api.config?.managementFeeBps ??
      (Number(process.env.MANAGEMENT_FEE_BPS) || 200),
    supabaseUrl: api.config?.supabaseUrl ?? process.env.SUPABASE_URL ?? "",
    supabaseServiceKey: api.config?.supabaseServiceKey ?? process.env.SUPABASE_SERVICE_KEY ?? "",
  };

  if (!config.privateKey) {
    console.error(
      "[clawvault] No private key configured. Set CLAWVAULT_PRIVATE_KEY env var or plugin config."
    );
    return;
  }

  const client = createBaseClient(config.privateKey, config.rpcUrl);
  const store = new PortfolioStore();
  const costTracker = new CostTracker();

  const ctx: PluginContext = { client, store, costTracker, config };

  console.log(`[clawvault] Initializing with wallet ${client.account.address}`);
  console.log(`[clawvault] RPC: ${config.rpcUrl}`);
  console.log(`[clawvault] Builder code: ${config.builderCode}`);

  // Register all agent tools
  registerCreatePlan(api, ctx);
  registerExecuteTrades(api, ctx);
  registerCheckPortfolio(api, ctx);
  registerRebalance(api, ctx);
  registerHarvestYield(api, ctx);

  // Fire-and-forget initial sync to Supabase
  syncToSupabase(ctx).catch(() => {});

  // Register background autonomous loop as a service
  api.registerService({
    id: "clawvault-loop",
    start: () => {
      loopCleanup = startAutonomousLoop(ctx);
    },
    stop: () => {
      if (loopCleanup) loopCleanup();
    },
  });
}
