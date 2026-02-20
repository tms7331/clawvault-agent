import {
  createPublicClient,
  createWalletClient,
  http,
  type PublicClient,
  type WalletClient,
  type Hash,
  type Address,
  type Chain,
  encodeFunctionData,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { appendBuilderCode } from "./builder-codes.js";

export interface BaseClient {
  publicClient: PublicClient;
  walletClient: WalletClient;
  account: ReturnType<typeof privateKeyToAccount>;
  chain: Chain;
}

/**
 * Create a viem client pair for Base (or Anvil).
 */
export function createBaseClient(
  privateKey: string,
  rpcUrl?: string
): BaseClient {
  const account = privateKeyToAccount(privateKey as `0x${string}`);

  // Use Ethereum Sepolia chain config but allow custom RPC URL
  const chain = {
    ...sepolia,
    rpcUrls: rpcUrl
      ? { default: { http: [rpcUrl] } }
      : sepolia.rpcUrls,
  } as Chain;

  const transport = http(rpcUrl ?? sepolia.rpcUrls.default.http[0]);

  const publicClient = createPublicClient({
    chain,
    transport,
  });

  const walletClient = createWalletClient({
    account,
    chain,
    transport,
  });

  return { publicClient, walletClient, account, chain };
}

/**
 * Send a contract write transaction with ERC-8021 builder code appended.
 */
export async function sendTxWithBuilderCode(
  client: BaseClient,
  params: {
    to: Address;
    abi: readonly any[];
    functionName: string;
    args: any[];
    builderCode: string;
  }
): Promise<Hash> {
  const calldata = encodeFunctionData({
    abi: params.abi,
    functionName: params.functionName,
    args: params.args,
  });

  const dataWithCode = appendBuilderCode(calldata, params.builderCode);

  const hash = await client.walletClient.sendTransaction({
    to: params.to,
    data: dataWithCode,
    account: client.account,
    chain: client.chain,
  });

  return hash;
}

/**
 * Wait for a transaction receipt and return gas used in USD estimate.
 */
export async function waitForTx(
  client: BaseClient,
  hash: Hash
): Promise<{ gasUsed: bigint; gasCostUsd: number }> {
  const receipt = await client.publicClient.waitForTransactionReceipt({
    hash,
  });

  const gasUsed = receipt.gasUsed;
  const effectiveGasPrice = receipt.effectiveGasPrice ?? 0n;
  const gasCostWei = gasUsed * effectiveGasPrice;

  // Rough ETH price estimate for gas cost in USD
  // Base gas is very cheap (~$0.001 per tx)
  const ethPriceUsd = 2500;
  const gasCostUsd =
    Number(gasCostWei) / 1e18 * ethPriceUsd;

  return { gasUsed, gasCostUsd };
}
