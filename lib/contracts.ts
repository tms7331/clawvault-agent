import { type ContractAddresses } from "./types.js";

// ----- Contract Addresses -----
// Update these after deploying contracts.
// For Anvil local dev, run the deploy script and paste addresses here.

export const ADDRESSES: ContractAddresses = {
  usdc: "0x0000000000000000000000000000000000000000", // MockUSDC (fill after deploy on Base Sepolia)
  savingsVault: "0x0000000000000000000000000000000000000000",
  hedgeRouter: "0x0000000000000000000000000000000000000000",
  reHedge: "0x0000000000000000000000000000000000000000",
  spHedge: "0x0000000000000000000000000000000000000000",
  bondHedge: "0x0000000000000000000000000000000000000000",
};

// ----- ABIs (minimal, only the functions we call) -----

export const ERC20_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
] as const;

export const SAVINGS_VAULT_ABI = [
  {
    name: "deposit",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    name: "drip",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "user", type: "address" }],
    outputs: [],
  },
  {
    name: "harvest",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "user", type: "address" }],
    outputs: [],
  },
  {
    name: "deposits",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "pendingYield",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "fund",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
] as const;

export const HEDGE_ROUTER_ABI = [
  {
    name: "buyHedge",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "hedgeToken", type: "address" },
      { name: "usdcAmount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "sellHedge",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "hedgeToken", type: "address" },
      { name: "hedgeAmount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "getPrice",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "hedgeToken", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;
