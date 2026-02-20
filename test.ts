/**
 * Local test for the ClawVault plugin.
 * Run: npx tsx test.ts
 *
 * This mocks the OpenClaw API and tests tool registration + basic execution.
 */

import register from "./index.js";

const tools: Map<string, any> = new Map();
const services: Map<string, any> = new Map();

const fakeApi = {
  config: {
    privateKey:
      process.env.CLAWVAULT_PRIVATE_KEY ??
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // Anvil default key
    rpcUrl: process.env.BASE_RPC_URL ?? "https://sepolia.base.org",
    builderCode: "clawvault",
    dashboardPort: 3402,
    rebalanceIntervalMinutes: 1, // 1 min for testing
    rebalanceThresholdPercent: 5,
    managementFeeBps: 200,
  },

  registerTool(def: any) {
    tools.set(def.name, def);
    console.log(`  Registered tool: ${def.name}`);
  },

  registerService(def: any) {
    services.set(def.id, def);
    console.log(`  Registered service: ${def.id}`);
  },
};

console.log("Registering plugin...");
register(fakeApi);

console.log(`\nTools registered: ${tools.size}`);
console.log(`Services registered: ${services.size}`);

// Test create_plan tool
console.log("\n--- Testing clawvault_create_plan ---");
const createPlan = tools.get("clawvault_create_plan");
if (createPlan) {
  const result = await createPlan.execute("test-1", {
    goal: "I want to buy a house in 3-5 years",
    depositAmountUsdc: 100,
    userAddress: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  });
  console.log("Result:", JSON.parse(result.content[0].text));
} else {
  console.log("Tool not found!");
}

console.log("\nDone! (Ctrl+C to exit)");
