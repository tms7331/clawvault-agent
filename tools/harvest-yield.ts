import { formatUnits } from "viem";
import { sendTxWithBuilderCode, waitForTx } from "../lib/base-client.js";
import { ADDRESSES, SAVINGS_VAULT_ABI } from "../lib/contracts.js";
import { syncToSupabase } from "../lib/supabase-sync.js";
import type { PluginContext } from "../lib/types.js";

const USDC_DECIMALS = 6;

export async function executeHarvest(
  ctx: PluginContext,
  planId: string
): Promise<{
  harvested: boolean;
  pendingYield: string;
  feeCollected: number;
  txHash?: string;
}> {
  const plan = ctx.store.getPlan(planId);
  if (!plan) {
    return { harvested: false, pendingYield: "0", feeCollected: 0 };
  }

  const builderCode = ctx.config.builderCode ?? "clawvault";
  const pc = ctx.client.publicClient;
  const agentAddr = ctx.client.account.address;

  // First, call drip() to accrue yield based on time elapsed
  const dripHash = await sendTxWithBuilderCode(ctx.client, {
    to: ADDRESSES.savingsVault,
    abi: SAVINGS_VAULT_ABI,
    functionName: "drip",
    args: [agentAddr],
    builderCode,
  });
  const dripReceipt = await waitForTx(ctx.client, dripHash);
  ctx.costTracker.recordGasCost("drip", dripReceipt.gasCostUsd, dripHash);

  // Check pending yield
  const pendingYield = (await pc.readContract({
    address: ADDRESSES.savingsVault,
    abi: SAVINGS_VAULT_ABI,
    functionName: "pendingYield",
    args: [agentAddr],
  })) as bigint;

  const pendingYieldFormatted = formatUnits(pendingYield, USDC_DECIMALS);

  // Only harvest if there's meaningful yield (> $0.001)
  if (pendingYield < 1000n) {
    return {
      harvested: false,
      pendingYield: pendingYieldFormatted,
      feeCollected: 0,
    };
  }

  // Harvest — the contract splits yield between user and agent wallet
  const harvestHash = await sendTxWithBuilderCode(ctx.client, {
    to: ADDRESSES.savingsVault,
    abi: SAVINGS_VAULT_ABI,
    functionName: "harvest",
    args: [agentAddr],
    builderCode,
  });
  const harvestReceipt = await waitForTx(ctx.client, harvestHash);
  ctx.costTracker.recordGasCost(
    "harvest",
    harvestReceipt.gasCostUsd,
    harvestHash
  );

  // Calculate fee portion (managementFeeBps of total yield)
  const feeBps = ctx.config.managementFeeBps ?? 200;
  const feeAmount = Number(pendingYield) * feeBps / 10000;
  const feeUsdc = feeAmount / 10 ** USDC_DECIMALS;

  // Record revenue
  ctx.costTracker.recordRevenue("management_fee", feeUsdc, harvestHash);

  // Record transaction
  ctx.store.recordTransaction({
    txHash: harvestHash,
    planId,
    type: "harvest",
    tokenIn: "Vault Yield",
    tokenOut: "USDC",
    amountIn: pendingYieldFormatted,
    amountOut: pendingYieldFormatted,
    gasCostUsd: harvestReceipt.gasCostUsd,
    timestamp: Date.now(),
    builderCodeIncluded: true,
  });
  ctx.store.addTransactionToPlan(planId, harvestHash);

  ctx.store.updatePlan(planId, { lastHarvestedAt: Date.now() });

  syncToSupabase(ctx).catch(() => {});

  return {
    harvested: true,
    pendingYield: pendingYieldFormatted,
    feeCollected: feeUsdc,
    txHash: harvestHash,
  };
}

export function registerHarvestYield(api: any, ctx: PluginContext) {
  api.registerTool({
    name: "clawvault_harvest_yield",
    description:
      "Harvest accrued yield from the SavingsVault. First calls drip() to " +
      "accrue time-based yield, then harvests. A management fee (default 2%) " +
      "is sent to the agent's operating wallet to fund compute costs. " +
      "Remaining yield stays in the user's portfolio.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        planId: {
          type: "string",
          description: "The plan ID to harvest yield for",
        },
      },
      required: ["planId"],
    },
    execute: async (_id: string, params: any) => {
      ctx.costTracker.recordComputeCost("harvest_yield", 0.01);

      const result = await executeHarvest(ctx, params.planId);

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
