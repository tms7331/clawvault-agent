export interface SavingsPlan {
  planId: string;
  userAddress: string;
  goal: string;
  timeline: string;
  riskLevel: "low" | "medium" | "medium-high" | "high";
  allocation: {
    stable: number;
    realEstateHedge: number;
    equityHedge: number;
    bondHedge: number;
  };
  depositAmountUsdc: number;
  status: "created" | "active" | "rebalancing" | "closed";
  createdAt: number;
  lastRebalancedAt?: number;
  lastHarvestedAt?: number;
  transactions: string[];
}

export interface TransactionRecord {
  txHash: string;
  planId: string;
  type:
    | "deposit"
    | "swap_buy"
    | "swap_sell"
    | "harvest"
    | "rebalance"
    | "approve";
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  gasCostUsd: number;
  timestamp: number;
  builderCodeIncluded: boolean;
}

export interface CostEntry {
  timestamp: number;
  type: "compute" | "gas";
  action: string;
  estimatedCostUsd: number;
  txHash?: string;
}

export interface RevenueEntry {
  timestamp: number;
  source: "management_fee" | "x402";
  amountUsdc: number;
  txHash?: string;
}

export interface ContractAddresses {
  usdc: `0x${string}`;
  savingsVault: `0x${string}`;
  hedgeRouter: `0x${string}`;
  reHedge: `0x${string}`;
  spHedge: `0x${string}`;
  bondHedge: `0x${string}`;
}

export interface PluginConfig {
  privateKey: string;
  rpcUrl: string;
  builderCode: string;
  dashboardPort: number;
  rebalanceIntervalMinutes: number;
  rebalanceThresholdPercent: number;
  managementFeeBps: number;
}

export interface PluginContext {
  client: {
    publicClient: any;
    walletClient: any;
    account: any;
  };
  store: any;
  costTracker: any;
  config: PluginConfig;
}
