import { formatUnits } from "viem";
import {
  ADDRESSES,
  ERC20_ABI,
  SAVINGS_VAULT_ABI,
  HEDGE_ROUTER_ABI,
} from "../lib/contracts.js";
import type { PluginContext } from "../lib/types.js";

const USDC_DECIMALS = 6;
const HEDGE_DECIMALS = 18;

export interface PortfolioSnapshot {
  planId: string;
  holdings: {
    stable: { balance: string; valueUsdc: number };
    realEstateHedge: { balance: string; valueUsdc: number };
    equityHedge: { balance: string; valueUsdc: number };
    bondHedge: { balance: string; valueUsdc: number };
  };
  totalValueUsdc: number;
  currentAllocation: {
    stable: number;
    realEstateHedge: number;
    equityHedge: number;
    bondHedge: number;
  };
  drift: {
    stable: number;
    realEstateHedge: number;
    equityHedge: number;
    bondHedge: number;
    maxDrift: number;
  };
}

export async function getPortfolioSnapshot(
  ctx: PluginContext,
  planId: string
): Promise<PortfolioSnapshot | null> {
  const plan = ctx.store.getPlan(planId);
  if (!plan) return null;

  const pc = ctx.client.publicClient;
  const agentAddr = ctx.client.account.address;

  // Read onchain balances
  const [vaultDeposit, reBalance, spBalance, bondBalance] = await Promise.all([
    pc.readContract({
      address: ADDRESSES.savingsVault,
      abi: SAVINGS_VAULT_ABI,
      functionName: "deposits",
      args: [agentAddr],
    }) as Promise<bigint>,
    pc.readContract({
      address: ADDRESSES.reHedge,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [agentAddr],
    }) as Promise<bigint>,
    pc.readContract({
      address: ADDRESSES.spHedge,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [agentAddr],
    }) as Promise<bigint>,
    pc.readContract({
      address: ADDRESSES.bondHedge,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [agentAddr],
    }) as Promise<bigint>,
  ]);

  // Get hedge token prices in USDC
  const [rePrice, spPrice, bondPrice] = await Promise.all([
    pc.readContract({
      address: ADDRESSES.hedgeRouter,
      abi: HEDGE_ROUTER_ABI,
      functionName: "getPrice",
      args: [ADDRESSES.reHedge],
    }) as Promise<bigint>,
    pc.readContract({
      address: ADDRESSES.hedgeRouter,
      abi: HEDGE_ROUTER_ABI,
      functionName: "getPrice",
      args: [ADDRESSES.spHedge],
    }) as Promise<bigint>,
    pc.readContract({
      address: ADDRESSES.hedgeRouter,
      abi: HEDGE_ROUTER_ABI,
      functionName: "getPrice",
      args: [ADDRESSES.bondHedge],
    }) as Promise<bigint>,
  ]);

  // Calculate USDC values
  const stableValueUsdc = Number(formatUnits(vaultDeposit, USDC_DECIMALS));
  const reValueUsdc =
    Number(formatUnits((reBalance * rePrice) / BigInt(1e18), USDC_DECIMALS));
  const spValueUsdc =
    Number(formatUnits((spBalance * spPrice) / BigInt(1e18), USDC_DECIMALS));
  const bondValueUsdc =
    Number(
      formatUnits((bondBalance * bondPrice) / BigInt(1e18), USDC_DECIMALS)
    );

  const totalValue = stableValueUsdc + reValueUsdc + spValueUsdc + bondValueUsdc;

  // Current allocation percentages
  const currentAllocation =
    totalValue > 0
      ? {
          stable: (stableValueUsdc / totalValue) * 100,
          realEstateHedge: (reValueUsdc / totalValue) * 100,
          equityHedge: (spValueUsdc / totalValue) * 100,
          bondHedge: (bondValueUsdc / totalValue) * 100,
        }
      : { stable: 0, realEstateHedge: 0, equityHedge: 0, bondHedge: 0 };

  // Drift from target
  const drift = {
    stable: Math.abs(currentAllocation.stable - plan.allocation.stable),
    realEstateHedge: Math.abs(
      currentAllocation.realEstateHedge - plan.allocation.realEstateHedge
    ),
    equityHedge: Math.abs(
      currentAllocation.equityHedge - plan.allocation.equityHedge
    ),
    bondHedge: Math.abs(
      currentAllocation.bondHedge - plan.allocation.bondHedge
    ),
    maxDrift: 0,
  };
  drift.maxDrift = Math.max(
    drift.stable,
    drift.realEstateHedge,
    drift.equityHedge,
    drift.bondHedge
  );

  return {
    planId,
    holdings: {
      stable: {
        balance: formatUnits(vaultDeposit, USDC_DECIMALS),
        valueUsdc: stableValueUsdc,
      },
      realEstateHedge: {
        balance: formatUnits(reBalance, HEDGE_DECIMALS),
        valueUsdc: reValueUsdc,
      },
      equityHedge: {
        balance: formatUnits(spBalance, HEDGE_DECIMALS),
        valueUsdc: spValueUsdc,
      },
      bondHedge: {
        balance: formatUnits(bondBalance, HEDGE_DECIMALS),
        valueUsdc: bondValueUsdc,
      },
    },
    totalValueUsdc: totalValue,
    currentAllocation,
    drift,
  };
}

export function registerCheckPortfolio(api: any, ctx: PluginContext) {
  api.registerTool({
    name: "savings_check_portfolio",
    description:
      "Check the current status of a savings plan. Returns current holdings, " +
      "their USDC values, drift from target allocation, and total portfolio value.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        planId: {
          type: "string",
          description: "The plan ID to check",
        },
      },
      required: ["planId"],
    },
    execute: async (_id: string, params: any) => {
      ctx.costTracker.recordComputeCost("check_portfolio", 0.01);

      const snapshot = await getPortfolioSnapshot(ctx, params.planId);
      if (!snapshot) {
        return {
          content: [
            { type: "text", text: `Error: Plan ${params.planId} not found` },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(snapshot, null, 2),
          },
        ],
      };
    },
  });
}
