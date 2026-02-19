import { createBaseClient } from "./lib/base-client.js";
import { PortfolioStore } from "./lib/portfolio-store.js";
import { CostTracker } from "./lib/cost-tracker.js";
import { registerCreatePlan } from "./tools/create-plan.js";
import { registerExecuteTrades } from "./tools/execute-trades.js";
import { registerCheckPortfolio } from "./tools/check-portfolio.js";
import { registerRebalance } from "./tools/rebalance.js";
import { registerHarvestYield } from "./tools/harvest-yield.js";
import { startAutonomousLoop } from "./services/autonomous-loop.js";
import { startDashboardServer } from "./services/dashboard-server.js";
import type { PluginConfig, PluginContext } from "./lib/types.js";

let loopCleanup: (() => void) | null = null;
let dashboardCleanup: (() => void) | null = null;

export default function register(api: any) {
  const config: PluginConfig = {
    privateKey: api.config?.privateKey ?? process.env.SAVINGS_AGENT_PRIVATE_KEY ?? "",
    rpcUrl: api.config?.rpcUrl ?? process.env.BASE_RPC_URL ?? "http://127.0.0.1:8545",
    builderCode: api.config?.builderCode ?? process.env.BUILDER_CODE ?? "savingsagent",
    dashboardPort: api.config?.dashboardPort ?? (Number(process.env.DASHBOARD_PORT) || 3402),
    rebalanceIntervalMinutes:
      api.config?.rebalanceIntervalMinutes ??
      (Number(process.env.REBALANCE_INTERVAL_MINUTES) || 60),
    rebalanceThresholdPercent:
      api.config?.rebalanceThresholdPercent ??
      (Number(process.env.REBALANCE_THRESHOLD_PERCENT) || 5),
    managementFeeBps:
      api.config?.managementFeeBps ??
      (Number(process.env.MANAGEMENT_FEE_BPS) || 200),
  };

  if (!config.privateKey) {
    console.error(
      "[savings-agent] No private key configured. Set SAVINGS_AGENT_PRIVATE_KEY env var or plugin config."
    );
    return;
  }

  const client = createBaseClient(config.privateKey, config.rpcUrl);
  const store = new PortfolioStore();
  const costTracker = new CostTracker();

  const ctx: PluginContext = { client, store, costTracker, config };

  console.log(`[savings-agent] Initializing with wallet ${client.account.address}`);
  console.log(`[savings-agent] RPC: ${config.rpcUrl}`);
  console.log(`[savings-agent] Builder code: ${config.builderCode}`);

  // Register all agent tools
  registerCreatePlan(api, ctx);
  registerExecuteTrades(api, ctx);
  registerCheckPortfolio(api, ctx);
  registerRebalance(api, ctx);
  registerHarvestYield(api, ctx);

  // Register background autonomous loop as a service
  api.registerService({
    id: "savings-agent-loop",
    start: () => {
      loopCleanup = startAutonomousLoop(ctx);
    },
    stop: () => {
      if (loopCleanup) loopCleanup();
    },
  });

  // Register dashboard HTTP server as a service
  api.registerService({
    id: "savings-agent-dashboard",
    start: () => {
      dashboardCleanup = startDashboardServer(ctx);
    },
    stop: () => {
      if (dashboardCleanup) dashboardCleanup();
    },
  });
}
