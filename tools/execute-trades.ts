import { parseUnits, formatUnits } from "viem";
import { sendTxWithBuilderCode, waitForTx } from "../lib/base-client.js";
import {
  ADDRESSES,
  ERC20_ABI,
  SAVINGS_VAULT_ABI,
  HEDGE_ROUTER_ABI,
} from "../lib/contracts.js";
import type { PluginContext, TransactionRecord } from "../lib/types.js";

const USDC_DECIMALS = 6;

async function approveIfNeeded(
  ctx: PluginContext,
  spender: `0x${string}`,
  amount: bigint,
  planId: string
): Promise<string | null> {
  const builderCode = ctx.config.builderCode ?? "clawvault";

  const hash = await sendTxWithBuilderCode(ctx.client, {
    to: ADDRESSES.usdc,
    abi: ERC20_ABI,
    functionName: "approve",
    args: [spender, amount],
    builderCode,
  });

  const { gasCostUsd } = await waitForTx(ctx.client, hash);
  ctx.costTracker.recordGasCost("approve", gasCostUsd, hash);

  ctx.store.recordTransaction({
    txHash: hash,
    planId,
    type: "approve",
    tokenIn: "USDC",
    tokenOut: "-",
    amountIn: formatUnits(amount, USDC_DECIMALS),
    amountOut: "0",
    gasCostUsd,
    timestamp: Date.now(),
    builderCodeIncluded: true,
  } satisfies TransactionRecord);

  ctx.store.addTransactionToPlan(planId, hash);
  return hash;
}

async function depositToVault(
  ctx: PluginContext,
  amount: bigint,
  planId: string
): Promise<string> {
  const builderCode = ctx.config.builderCode ?? "clawvault";

  const hash = await sendTxWithBuilderCode(ctx.client, {
    to: ADDRESSES.savingsVault,
    abi: SAVINGS_VAULT_ABI,
    functionName: "deposit",
    args: [amount],
    builderCode,
  });

  const { gasCostUsd } = await waitForTx(ctx.client, hash);
  ctx.costTracker.recordGasCost("deposit", gasCostUsd, hash);

  ctx.store.recordTransaction({
    txHash: hash,
    planId,
    type: "deposit",
    tokenIn: "USDC",
    tokenOut: "Vault",
    amountIn: formatUnits(amount, USDC_DECIMALS),
    amountOut: formatUnits(amount, USDC_DECIMALS),
    gasCostUsd,
    timestamp: Date.now(),
    builderCodeIncluded: true,
  } satisfies TransactionRecord);

  ctx.store.addTransactionToPlan(planId, hash);
  return hash;
}

async function buyHedge(
  ctx: PluginContext,
  hedgeToken: `0x${string}`,
  hedgeName: string,
  usdcAmount: bigint,
  planId: string
): Promise<string> {
  const builderCode = ctx.config.builderCode ?? "clawvault";

  const hash = await sendTxWithBuilderCode(ctx.client, {
    to: ADDRESSES.hedgeRouter,
    abi: HEDGE_ROUTER_ABI,
    functionName: "buyHedge",
    args: [hedgeToken, usdcAmount],
    builderCode,
  });

  const { gasCostUsd } = await waitForTx(ctx.client, hash);
  ctx.costTracker.recordGasCost("swap_buy", gasCostUsd, hash);

  ctx.store.recordTransaction({
    txHash: hash,
    planId,
    type: "swap_buy",
    tokenIn: "USDC",
    tokenOut: hedgeName,
    amountIn: formatUnits(usdcAmount, USDC_DECIMALS),
    amountOut: formatUnits(usdcAmount, USDC_DECIMALS), // 1:1 at initial price
    gasCostUsd,
    timestamp: Date.now(),
    builderCodeIncluded: true,
  } satisfies TransactionRecord);

  ctx.store.addTransactionToPlan(planId, hash);
  return hash;
}

export function registerExecuteTrades(api: any, ctx: PluginContext) {
  api.registerTool({
    name: "clawvault_execute_trades",
    description:
      "Execute onchain trades on Base to match a savings plan's target allocation. " +
      "Deposits USDC into the yield vault for the stable portion, and swaps USDC " +
      "for hedge tokens via the HedgeRouter for other allocations. " +
      "Every transaction includes ERC-8021 builder codes.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        planId: {
          type: "string",
          description: "The plan ID returned by clawvault_create_plan",
        },
      },
      required: ["planId"],
    },
    execute: async (_id: string, params: any) => {
      ctx.costTracker.recordComputeCost("execute_trades", 0.01);

      const plan = ctx.store.getPlan(params.planId);
      if (!plan) {
        return {
          content: [
            { type: "text", text: `Error: Plan ${params.planId} not found` },
          ],
        };
      }

      const totalUsdc = parseUnits(
        plan.depositAmountUsdc.toString(),
        USDC_DECIMALS
      );

      const stableAmount =
        (totalUsdc * BigInt(plan.allocation.stable)) / 100n;
      const reAmount =
        (totalUsdc * BigInt(plan.allocation.realEstateHedge)) / 100n;
      const spAmount =
        (totalUsdc * BigInt(plan.allocation.equityHedge)) / 100n;
      const bondAmount =
        (totalUsdc * BigInt(plan.allocation.bondHedge)) / 100n;

      const results: string[] = [];

      // Approve vault + router to spend our USDC
      const totalNeeded = stableAmount + reAmount + spAmount + bondAmount;
      if (stableAmount > 0n) {
        await approveIfNeeded(ctx, ADDRESSES.savingsVault, stableAmount, plan.planId);
      }
      const routerTotal = reAmount + spAmount + bondAmount;
      if (routerTotal > 0n) {
        await approveIfNeeded(ctx, ADDRESSES.hedgeRouter, routerTotal, plan.planId);
      }

      // Deposit stable portion into vault
      if (stableAmount > 0n) {
        const h = await depositToVault(ctx, stableAmount, plan.planId);
        results.push(
          `Deposited ${formatUnits(stableAmount, USDC_DECIMALS)} USDC to vault: ${h}`
        );
      }

      // Buy hedge tokens
      if (reAmount > 0n) {
        const h = await buyHedge(
          ctx,
          ADDRESSES.reHedge,
          "RE-HEDGE",
          reAmount,
          plan.planId
        );
        results.push(
          `Bought RE-HEDGE with ${formatUnits(reAmount, USDC_DECIMALS)} USDC: ${h}`
        );
      }
      if (spAmount > 0n) {
        const h = await buyHedge(
          ctx,
          ADDRESSES.spHedge,
          "SP-HEDGE",
          spAmount,
          plan.planId
        );
        results.push(
          `Bought SP-HEDGE with ${formatUnits(spAmount, USDC_DECIMALS)} USDC: ${h}`
        );
      }
      if (bondAmount > 0n) {
        const h = await buyHedge(
          ctx,
          ADDRESSES.bondHedge,
          "BOND-HEDGE",
          bondAmount,
          plan.planId
        );
        results.push(
          `Bought BOND-HEDGE with ${formatUnits(bondAmount, USDC_DECIMALS)} USDC: ${h}`
        );
      }

      // Mark plan as active
      ctx.store.updatePlan(plan.planId, { status: "active" });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                planId: plan.planId,
                status: "active",
                tradesExecuted: results.length,
                trades: results,
              },
              null,
              2
            ),
          },
        ],
      };
    },
  });
}
