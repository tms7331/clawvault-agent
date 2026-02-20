import { formatEther, formatUnits } from "viem";
import { ADDRESSES, ERC20_ABI } from "./contracts.js";
import type { PluginContext } from "./types.js";

const USDC_DECIMALS = 6;
const startTime = Date.now();

export async function syncToSupabase(ctx: PluginContext): Promise<void> {
  const { supabaseUrl, supabaseServiceKey } = ctx.config;
  if (!supabaseUrl || !supabaseServiceKey) return;

  try {
    const pc = ctx.client.publicClient;
    const agentAddr = ctx.client.account.address;

    // Fetch wallet balances
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
      // RPC down — use zeros
    }

    const ethUsd = Number(formatEther(ethBalance)) * 2500;

    // Portfolio data
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

    const txs = ctx.store.getRecentTransactions(10000);
    const autonomousActions = ctx.costTracker
      .getRecentCosts(10000)
      .filter((c: any) => c.action.startsWith("autonomous")).length;

    // Cost/revenue data
    const totalRevenue =
      Math.round(ctx.costTracker.getTotalRevenue() * 10000) / 10000;
    const totalComputeCost =
      Math.round(ctx.costTracker.getTotalComputeCost() * 10000) / 10000;
    const totalGasCost =
      Math.round(ctx.costTracker.getTotalGasCost() * 10000) / 10000;
    const netBalance =
      Math.round(ctx.costTracker.getNetBalance() * 10000) / 10000;

    const row = {
      agent_address: agentAddr,
      eth_balance_wei: ethBalance.toString(),
      eth_balance_usd: Math.round(ethUsd * 100) / 100,
      usdc_balance_raw: usdcBalance.toString(),
      usdc_balance_formatted:
        Math.round(Number(formatUnits(usdcBalance, USDC_DECIMALS)) * 100) /
        100,
      total_revenue: totalRevenue,
      total_compute_cost: totalComputeCost,
      total_gas_cost: totalGasCost,
      net_balance: netBalance,
      is_self_sustaining: ctx.costTracker.isSelfSustaining(),
      total_managed_usdc: totalManaged,
      active_plans: activePlans.length,
      last_rebalance: lastRebalance
        ? new Date(lastRebalance).toISOString()
        : null,
      last_harvest: lastHarvest ? new Date(lastHarvest).toISOString() : null,
      started_at: new Date(startTime).toISOString(),
      autonomous_actions: autonomousActions,
      transactions_executed: txs.length,
      updated_at: new Date().toISOString(),
    };

    const res = await fetch(
      `${supabaseUrl}/rest/v1/bot_stats`,
      {
        method: "POST",
        headers: {
          apikey: supabaseServiceKey,
          Authorization: `Bearer ${supabaseServiceKey}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates",
        },
        body: JSON.stringify(row),
      }
    );

    if (!res.ok) {
      const body = await res.text();
      console.error(`[clawvault] Supabase sync failed (${res.status}): ${body}`);
    } else {
      console.log("[clawvault] Synced stats to Supabase");
    }
  } catch (err) {
    console.error("[clawvault] Supabase sync error:", err);
  }
}
