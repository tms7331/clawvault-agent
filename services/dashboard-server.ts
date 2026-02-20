import { createServer, type Server } from "node:http";
import { formatEther, formatUnits } from "viem";
import { ADDRESSES, ERC20_ABI } from "../lib/contracts.js";
import type { PluginContext } from "../lib/types.js";

const USDC_DECIMALS = 6;

async function getStats(ctx: PluginContext) {
  const pc = ctx.client.publicClient;
  const agentAddr = ctx.client.account.address;

  let ethBalance = 0n;
  let usdcBalance = 0n;

  try {
    ethBalance = await pc.getBalance({ address: agentAddr });
    usdcBalance = (await pc.readContract({
      address: ADDRESSES.usdc,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [agentAddr],
    })) as bigint;
  } catch {
    // If RPC is down, return zeros
  }

  const ethUsd = Number(formatEther(ethBalance)) * 2500; // rough estimate
  const plans = ctx.store.getAllPlans();
  const activePlans = plans.filter(
    (p: any) => p.status === "active" || p.status === "rebalancing"
  );
  const totalManaged = activePlans.reduce(
    (sum: number, p: any) => sum + p.depositAmountUsdc,
    0
  );

  const lastRebalance = activePlans
    .map((p: any) => p.lastRebalancedAt)
    .filter(Boolean)
    .sort((a: number, b: number) => b - a)[0];

  const lastHarvest = activePlans
    .map((p: any) => p.lastHarvestedAt)
    .filter(Boolean)
    .sort((a: number, b: number) => b - a)[0];

  const txs = ctx.store.getRecentTransactions(1000);

  return {
    agentAddress: agentAddr,
    walletBalances: {
      ethWei: ethBalance.toString(),
      ethUsd: Math.round(ethUsd * 100) / 100,
      usdcRaw: usdcBalance.toString(),
      usdcFormatted:
        Math.round(Number(formatUnits(usdcBalance, USDC_DECIMALS)) * 100) /
        100,
    },
    sustainability: {
      totalRevenue:
        Math.round(ctx.costTracker.getTotalRevenue() * 10000) / 10000,
      totalComputeCost:
        Math.round(ctx.costTracker.getTotalComputeCost() * 10000) / 10000,
      totalGasCost:
        Math.round(ctx.costTracker.getTotalGasCost() * 10000) / 10000,
      netBalance:
        Math.round(ctx.costTracker.getNetBalance() * 10000) / 10000,
      isSelfSustaining: ctx.costTracker.isSelfSustaining(),
    },
    portfolio: {
      totalManagedUsdc: totalManaged,
      activePlans: activePlans.length,
      lastRebalance: lastRebalance
        ? new Date(lastRebalance).toISOString()
        : null,
      lastHarvest: lastHarvest ? new Date(lastHarvest).toISOString() : null,
    },
    uptime: {
      startedAt: new Date(startTime).toISOString(),
      autonomousActions: ctx.costTracker
        .getRecentCosts(10000)
        .filter((c: any) => c.action.startsWith("autonomous")).length,
      transactionsExecuted: txs.length,
    },
  };
}

const startTime = Date.now();

/**
 * Local-only debug API server. The public dashboard is a static site
 * deployed separately that reads directly from the blockchain.
 * This server is only for local debugging and is bound to localhost.
 */
export function startDashboardServer(ctx: PluginContext): () => void {
  const port = ctx.config.dashboardPort ?? 3402;

  const server: Server = createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      if (req.url === "/api/stats") {
        const stats = await getStats(ctx);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(stats));
      } else if (req.url === "/api/transactions") {
        const txs = ctx.store.getRecentTransactions(50);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(txs));
      } else if (req.url === "/api/plans") {
        const plans = ctx.store.getAllPlans();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(plans));
      } else if (req.url === "/api/costs") {
        const costs = ctx.costTracker.getRecentCosts(50);
        const revenue = ctx.costTracker.getRecentRevenue(50);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ costs, revenue }));
      } else {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not found" }));
      }
    } catch (err: any) {
      console.error("[clawvault] API error:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(
      `[clawvault] Debug API running at http://127.0.0.1:${port}`
    );
  });

  return () => {
    server.close();
    console.log("[clawvault] Debug API stopped");
  };
}
