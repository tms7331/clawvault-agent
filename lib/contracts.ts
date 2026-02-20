import { type ContractAddresses } from "./types.js";

// ----- Contract Addresses -----
// Update these after deploying contracts.
// For Anvil local dev, run the deploy script and paste addresses here.

export const ADDRESSES: ContractAddresses = {
  usdc: "0x0e233Cb8B535dE5fB9AF47516Df02F5b0DB46EBD",
  savingsVault: "0xfa448Bc02f6001Ec3c0433F29eD55d04d994bD76",
  hedgeRouter: "0x349C43fFf432059c968aE81F297136FAA0E2e342",
  reHedge: "0x14a47990A725E5Bfdb56773aF5650bd4cf6613fD",
  spHedge: "0xfEc612566550F6908A20bC39Cb548181470bfb2a",
  bondHedge: "0xa312664238ea24BEE9289629bB231d6DD1Fc982F",
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
