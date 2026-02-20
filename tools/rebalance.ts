import { parseUnits, formatUnits } from "viem";
import { getPortfolioSnapshot } from "./check-portfolio.js";
import { sendTxWithBuilderCode, waitForTx } from "../lib/base-client.js";
import {
  ADDRESSES,
  ERC20_ABI,
  HEDGE_ROUTER_ABI,
  SAVINGS_VAULT_ABI,
} from "../lib/contracts.js";
import type { PluginContext } from "../lib/types.js";

const USDC_DECIMALS = 6;

export async function executeRebalance(
  ctx: PluginContext,
  planId: string
): Promise<{ rebalanced: boolean; trades: string[]; maxDrift: number }> {
  const snapshot = await getPortfolioSnapshot(ctx, planId);
  if (!snapshot) {
    return { rebalanced: false, trades: [], maxDrift: 0 };
  }

  const threshold = ctx.config.rebalanceThresholdPercent ?? 5;
  if (snapshot.drift.maxDrift < threshold) {
    return {
      rebalanced: false,
      trades: [],
      maxDrift: snapshot.drift.maxDrift,
    };
  }

  const plan = ctx.store.getPlan(planId);
  if (!plan) return { rebalanced: false, trades: [], maxDrift: 0 };

  const builderCode = ctx.config.builderCode ?? "clawvault";
  const totalValue = snapshot.totalValueUsdc;
  const trades: string[] = [];

  // Calculate target USDC amounts for each hedge bucket
  const hedgeBuckets = [
    {
      name: "RE-HEDGE",
      token: ADDRESSES.reHedge,
      targetPct: plan.allocation.realEstateHedge,
      currentValue: snapshot.holdings.realEstateHedge.valueUsdc,
    },
    {
      name: "SP-HEDGE",
      token: ADDRESSES.spHedge,
      targetPct: plan.allocation.equityHedge,
      currentValue: snapshot.holdings.equityHedge.valueUsdc,
    },
    {
      name: "BOND-HEDGE",
      token: ADDRESSES.bondHedge,
      targetPct: plan.allocation.bondHedge,
      currentValue: snapshot.holdings.bondHedge.valueUsdc,
    },
  ];

  ctx.store.updatePlan(planId, { status: "rebalancing" });

  for (const bucket of hedgeBuckets) {
    const targetValue = (totalValue * bucket.targetPct) / 100;
    const delta = targetValue - bucket.currentValue;

    // Only trade if delta is meaningful (> $0.10)
    if (Math.abs(delta) < 0.1) continue;

    if (delta > 0) {
      // Under-allocated: buy more hedge tokens
      const usdcAmount = parseUnits(delta.toFixed(USDC_DECIMALS), USDC_DECIMALS);

      // Approve router
      await sendTxWithBuilderCode(ctx.client, {
        to: ADDRESSES.usdc,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [ADDRESSES.hedgeRouter, usdcAmount],
        builderCode,
      });

      const hash = await sendTxWithBuilderCode(ctx.client, {
        to: ADDRESSES.hedgeRouter,
        abi: HEDGE_ROUTER_ABI,
        functionName: "buyHedge",
        args: [bucket.token, usdcAmount],
        builderCode,
      });

      const { gasCostUsd } = await waitForTx(ctx.client, hash);
      ctx.costTracker.recordGasCost("rebalance_buy", gasCostUsd, hash);

      ctx.store.recordTransaction({
        txHash: hash,
        planId,
        type: "rebalance",
        tokenIn: "USDC",
        tokenOut: bucket.name,
        amountIn: delta.toFixed(2),
        amountOut: delta.toFixed(2),
        gasCostUsd,
        timestamp: Date.now(),
        builderCodeIncluded: true,
      });
      ctx.store.addTransactionToPlan(planId, hash);
      trades.push(`Bought ${delta.toFixed(2)} USDC of ${bucket.name}: ${hash}`);
    } else {
      // Over-allocated: sell hedge tokens
      const usdcToSell = Math.abs(delta);
      // Convert USDC value to hedge token amount (approximate at current price)
      const pc = ctx.client.publicClient;
      const price = (await pc.readContract({
        address: ADDRESSES.hedgeRouter,
        abi: HEDGE_ROUTER_ABI,
        functionName: "getPrice",
        args: [bucket.token],
      })) as bigint;

      const hedgeAmount =
        parseUnits(usdcToSell.toFixed(USDC_DECIMALS), USDC_DECIMALS) *
        BigInt(1e18) /
        price;

      // Approve router to burn our tokens
      await sendTxWithBuilderCode(ctx.client, {
        to: bucket.token,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [ADDRESSES.hedgeRouter, hedgeAmount],
        builderCode,
      });

      const hash = await sendTxWithBuilderCode(ctx.client, {
        to: ADDRESSES.hedgeRouter,
        abi: HEDGE_ROUTER_ABI,
        functionName: "sellHedge",
        args: [bucket.token, hedgeAmount],
        builderCode,
      });

      const { gasCostUsd } = await waitForTx(ctx.client, hash);
      ctx.costTracker.recordGasCost("rebalance_sell", gasCostUsd, hash);

      ctx.store.recordTransaction({
        txHash: hash,
        planId,
        type: "rebalance",
        tokenIn: bucket.name,
        tokenOut: "USDC",
        amountIn: formatUnits(hedgeAmount, 18),
        amountOut: usdcToSell.toFixed(2),
        gasCostUsd,
        timestamp: Date.now(),
        builderCodeIncluded: true,
      });
      ctx.store.addTransactionToPlan(planId, hash);
      trades.push(
        `Sold ${usdcToSell.toFixed(2)} USDC of ${bucket.name}: ${hash}`
      );
    }
  }

  ctx.store.updatePlan(planId, {
    status: "active",
    lastRebalancedAt: Date.now(),
  });

  return { rebalanced: true, trades, maxDrift: snapshot.drift.maxDrift };
}

export function registerRebalance(api: any, ctx: PluginContext) {
  api.registerTool({
    name: "clawvault_rebalance",
    description:
      "Check if a savings plan has drifted beyond the threshold and execute " +
      "trades to rebalance to the target allocation. Only trades if drift exceeds " +
      "the configured threshold (default 5%).",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        planId: {
          type: "string",
          description: "The plan ID to rebalance",
        },
      },
      required: ["planId"],
    },
    execute: async (_id: string, params: any) => {
      ctx.costTracker.recordComputeCost("rebalance", 0.02);

      const result = await executeRebalance(ctx, params.planId);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  });
}
