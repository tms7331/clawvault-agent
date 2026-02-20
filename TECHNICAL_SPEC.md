# ClawVault: Technical Specification

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Project Structure](#project-structure)
3. [Plugin Registration](#plugin-registration)
4. [Tool Specifications](#tool-specifications)
5. [Smart Contracts](#smart-contracts)
6. [ERC-8021 Builder Codes](#erc-8021-builder-codes)
7. [ERC-8004 Agent Identity](#erc-8004-agent-identity)
8. [x402 Integration](#x402-integration)
9. [Self-Sustainability Engine](#self-sustainability-engine)
10. [Dashboard Service](#dashboard-service)
11. [Data Models & Persistence](#data-models--persistence)
12. [Configuration](#configuration)
13. [Deployment Guide](#deployment-guide)
14. [Dependencies](#dependencies)

---

## 1. Architecture Overview

```
+------------------+       +---------------------+
|   OpenClaw Agent |       |   Public Dashboard  |
|   (LLM + Tools)  |       |   (HTTP :3402)      |
+--------+---------+       +----------+----------+
         |                            |
         v                            v
+--------+---------+       +----------+----------+
|  agent/          |       |   frontend/         |
|  Plugin (index.ts)|<---->|   (index.html)      |
+--------+---------+       +----------+----------+
         |                            |
         v                            v
+--------+----------------------------+----------+
|              agent/lib/                         |
|  base-client | builder-codes | portfolio-store  |
|  cost-tracker | contracts (ABIs from contracts/)|
+-------------------------------------------------+
         |
         v
+--------+---------+
|   Base / Anvil   |
|  contracts/src/   |
|  - HedgeToken x3 |
|  - SavingsVault   |
|  - HedgeRouter    |
+-------------------+
```

### Monorepo Structure

The project is a **single git repo** with three independent packages managed via npm workspaces:

| Folder | Purpose | Build Tool | Language |
|--------|---------|-----------|----------|
| `agent/` | OpenClaw plugin — tools, services, persistence | `npx tsx` | TypeScript |
| `frontend/` | Public dashboard served by agent | None (static) | HTML/CSS/JS |
| `contracts/` | Solidity smart contracts | Foundry (`forge`) | Solidity |

**Cross-package dependencies:**
- `agent/` reads compiled ABIs from `contracts/out/` (Foundry build output)
- `agent/` serves `frontend/index.html` via its dashboard HTTP service
- `contracts/` is fully independent — Foundry manages its own deps

**Anvil (local dev):**
- Run `anvil` to get a local Base-like chain at `http://127.0.0.1:8545`
- Deploy contracts with `forge script ... --rpc-url http://127.0.0.1:8545`
- Point agent's `rpcUrl` config to Anvil for testing
- Switch to `https://sepolia.base.org` for production

### Data Flow

1. **User -> OpenClaw Agent**: "I want to save for a house in 3-5 years"
2. **Agent -> `clawvault_create_plan` tool**: Analyzes goal, returns allocation
3. **Agent -> `clawvault_execute_trades` tool**: Sends transactions to Base/Anvil
4. **Background Service (loop)**: Every N minutes, checks drift, triggers rebalance/harvest
5. **Dashboard Service**: Serves `frontend/index.html` + JSON API, reads from shared persistence

---

## 2. Project Structure

```
clawvault/                       # Monorepo root
├── package.json                    # Root: npm workspaces config
├── .gitignore                      # Node, Foundry, env files
├── .env.example                    # Template for env vars
├── PRD.md
├── TECHNICAL_SPEC.md
│
├── agent/                          # OpenClaw plugin
│   ├── package.json                # Plugin manifest (openclaw.extensions)
│   ├── openclaw.plugin.json        # OpenClaw metadata + configSchema
│   ├── index.ts                    # Entry: registers tools + services
│   ├── tools/
│   │   ├── create-plan.ts          # clawvault_create_plan tool
│   │   ├── execute-trades.ts       # clawvault_execute_trades tool
│   │   ├── check-portfolio.ts      # clawvault_check_portfolio tool
│   │   ├── rebalance.ts            # clawvault_rebalance tool
│   │   └── harvest-yield.ts        # clawvault_harvest_yield tool
│   ├── lib/
│   │   ├── base-client.ts          # viem publicClient + walletClient
│   │   ├── builder-codes.ts        # ERC-8021 calldata suffix helpers
│   │   ├── contracts.ts            # ABIs + addresses + contract helpers
│   │   ├── portfolio-store.ts      # JSON file-based persistence
│   │   ├── cost-tracker.ts         # LLM + gas cost tracking
│   │   └── types.ts                # Shared TypeScript types
│   ├── services/
│   │   ├── autonomous-loop.ts      # Background rebalance + harvest loop
│   │   └── dashboard-server.ts     # HTTP server serving frontend + API
│   └── test.ts                     # Local tool tests (mock API)
│
├── frontend/                       # Public dashboard
│   ├── package.json                # Minimal (for workspace)
│   └── index.html                  # Single-page: stats, txs, portfolio
│
└── contracts/                      # Foundry project
    ├── foundry.toml                # Foundry config
    ├── src/
    │   ├── HedgeToken.sol          # ERC-20 mock hedge instrument
    │   ├── SavingsVault.sol        # Yield-bearing vault with drip/harvest
    │   └── HedgeRouter.sol         # Swap router (USDC <-> hedge tokens)
    ├── script/
    │   └── Deploy.s.sol            # Deploy + fund + configure all contracts
    └── test/
        └── SavingsVault.t.sol      # Contract tests
```

---

## 3. Plugin Registration

### Root package.json (clawvault/package.json)

```json
{
  "name": "clawvault-monorepo",
  "private": true,
  "workspaces": ["agent", "frontend"]
}
```

### Agent package.json (agent/package.json)

```json
{
  "name": "clawvault",
  "version": "0.1.0",
  "type": "module",
  "openclaw": {
    "extensions": ["./index.ts"]
  },
  "dependencies": {
    "viem": "^2.21.0"
  }
}
```

### openclaw.plugin.json (agent/openclaw.plugin.json)

```json
{
  "id": "clawvault",
  "name": "ClawVault",
  "description": "Autonomous AI savings advisor. Manages onchain portfolios on Base with personalized hedging strategies. Self-sustaining via yield management fees.",
  "configSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "privateKey": {
        "type": "string",
        "description": "Agent wallet private key (hex, with 0x prefix)"
      },
      "rpcUrl": {
        "type": "string",
        "description": "Base Sepolia RPC URL",
        "default": "https://sepolia.base.org"
      },
      "builderCode": {
        "type": "string",
        "description": "ERC-8021 builder code registered on base.dev",
        "default": "clawvault"
      },
      "dashboardPort": {
        "type": "number",
        "description": "Port for the public dashboard HTTP server",
        "default": 3402
      },
      "rebalanceIntervalMinutes": {
        "type": "number",
        "description": "How often the autonomous loop checks for drift",
        "default": 60
      },
      "rebalanceThresholdPercent": {
        "type": "number",
        "description": "Drift threshold (%) before triggering rebalance",
        "default": 5
      },
      "managementFeeBps": {
        "type": "number",
        "description": "Management fee in basis points (100 = 1%)",
        "default": 200
      }
    },
    "required": ["privateKey"]
  }
}
```

### index.ts (agent/index.ts — Entry Point)

```typescript
import { createBaseClient } from "./lib/base-client.js";
import { PortfolioStore } from "./lib/portfolio-store.js";
import { CostTracker } from "./lib/cost-tracker.js";
import { registerCreatePlan } from "./tools/create-plan.js";
import { registerExecuteTrades } from "./tools/execute-trades.js";
import { registerCheckPortfolio } from "./tools/check-portfolio.js";
import { registerRebalance } from "./tools/rebalance.js";
import { registerHarvestYield } from "./tools/harvest-yield.js";
import { startAutonomousLoop } from "./services/autonomous-loop.js";
import { startDashboardServer } from "./services/dashboard-server.js";

export default function register(api: any) {
  // Initialize shared state
  const config = api.config ?? {};
  const client = createBaseClient(config.privateKey, config.rpcUrl);
  const store = new PortfolioStore();
  const costTracker = new CostTracker();

  const ctx = { client, store, costTracker, config };

  // Register all agent tools
  registerCreatePlan(api, ctx);
  registerExecuteTrades(api, ctx);
  registerCheckPortfolio(api, ctx);
  registerRebalance(api, ctx);
  registerHarvestYield(api, ctx);

  // Register background autonomous loop
  api.registerService({
    id: "clawvault-loop",
    start: () => startAutonomousLoop(ctx),
    stop: () => { /* cleanup interval */ },
  });

  // Register dashboard HTTP server (serves frontend/index.html + JSON APIs)
  api.registerService({
    id: "clawvault-dashboard",
    start: () => startDashboardServer(ctx),
    stop: () => { /* close server */ },
  });
}
```

---

## 4. Tool Specifications

### 4.1 clawvault_create_plan

**Purpose:** Analyze a user's savings goal and produce a structured allocation plan.

```typescript
// tools/create-plan.ts
{
  name: "clawvault_create_plan",
  description: `Create a savings plan based on a user's goal description.
    Analyzes the timeline, risk tolerance, and objectives to produce
    a target asset allocation. Returns a plan with percentage allocations
    across: stable (USDC in yield vault), real estate hedge, equity hedge,
    and bond hedge.`,
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      goal: {
        type: "string",
        description: "Natural language description of the savings goal, e.g. 'I want to buy a house in 3-5 years'"
      },
      depositAmountUsdc: {
        type: "number",
        description: "Amount of USDC to allocate to this plan"
      },
      userAddress: {
        type: "string",
        description: "The user's wallet address (for tracking)"
      }
    },
    required: ["goal", "depositAmountUsdc", "userAddress"]
  }
}
```

**Execution Logic:**
1. Parse the goal to extract: timeline (years), objective (house, retirement, education, etc.), and implied risk tolerance
2. Map to allocation using heuristic rules:

| Timeline | Risk | Stable % | RE Hedge % | Equity Hedge % | Bond Hedge % |
|----------|------|----------|------------|----------------|--------------|
| < 2 yrs  | Low  | 70       | 10         | 10             | 10           |
| 2-5 yrs  | Med  | 50       | 20         | 20             | 10           |
| 5-10 yrs | Med-High | 30   | 25         | 35             | 10           |
| 10+ yrs  | High | 20       | 20         | 50             | 10           |

3. If goal mentions "house" or "real estate", boost RE Hedge by 10% (reduce stable)
4. Save plan to `PortfolioStore`
5. Return the plan as structured JSON

**Return Format:**
```json
{
  "content": [{
    "type": "text",
    "text": "{\"planId\":\"plan_abc123\",\"goal\":\"Buy a house in 3-5 years\",\"timeline\":\"3-5 years\",\"riskLevel\":\"medium\",\"allocation\":{\"stable\":50,\"realEstateHedge\":25,\"equityHedge\":20,\"bondHedge\":5},\"depositAmountUsdc\":1000,\"status\":\"created\"}"
  }]
}
```

### 4.2 clawvault_execute_trades

**Purpose:** Execute onchain transactions to match a plan's target allocation.

```typescript
{
  name: "clawvault_execute_trades",
  description: `Execute onchain trades on Base to match a savings plan's target allocation.
    Deposits USDC into the yield vault for the stable portion, and swaps USDC
    for hedge tokens via the HedgeRouter for other allocations.
    Every transaction includes ERC-8021 builder codes.`,
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      planId: {
        type: "string",
        description: "The plan ID returned by clawvault_create_plan"
      }
    },
    required: ["planId"]
  }
}
```

**Execution Logic:**
1. Load plan from `PortfolioStore`
2. Calculate USDC amounts per allocation bucket
3. Execute transactions in order:
   a. Approve USDC spending for SavingsVault and HedgeRouter
   b. Deposit stable portion into SavingsVault: `vault.deposit(amount)`
   c. Swap for RE Hedge: `router.swap(USDC, RE_HEDGE, amount)`
   d. Swap for Equity Hedge: `router.swap(USDC, SP_HEDGE, amount)`
   e. Swap for Bond Hedge: `router.swap(USDC, BOND_HEDGE, amount)`
4. Every transaction uses `appendBuilderCode()` on calldata
5. Record all tx hashes in `PortfolioStore`
6. Track gas costs in `CostTracker`
7. Return summary of executed trades

### 4.3 clawvault_check_portfolio

**Purpose:** Read current onchain balances and compare to target allocation.

```typescript
{
  name: "clawvault_check_portfolio",
  description: `Check the current status of a savings plan. Returns current holdings,
    their USDC values, drift from target allocation, and unrealized P&L.`,
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      planId: {
        type: "string",
        description: "The plan ID to check"
      }
    },
    required: ["planId"]
  }
}
```

**Execution Logic:**
1. Load plan from `PortfolioStore`
2. Read onchain balances:
   - `vault.balanceOf(userAddress)` for stable
   - `reHedge.balanceOf(agentAddress)` for RE hedge
   - `spHedge.balanceOf(agentAddress)` for equity hedge
   - `bondHedge.balanceOf(agentAddress)` for bond hedge
3. Get current prices from `router.getPrice(token)` to value in USDC
4. Calculate current allocation percentages
5. Calculate drift per bucket: `abs(current% - target%)`
6. Return portfolio status

### 4.4 clawvault_rebalance

**Purpose:** Detect drift and execute trades to bring allocation back to target.

```typescript
{
  name: "clawvault_rebalance",
  description: `Check if a savings plan has drifted beyond the threshold and execute
    trades to rebalance to the target allocation. Only trades if drift exceeds
    the configured threshold.`,
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      planId: {
        type: "string",
        description: "The plan ID to rebalance"
      }
    },
    required: ["planId"]
  }
}
```

**Execution Logic:**
1. Call `clawvault_check_portfolio` logic to get current allocation
2. For each bucket, calculate delta: `targetAmount - currentAmount`
3. If max drift < threshold, return "no rebalance needed"
4. Otherwise, for each bucket:
   - If over-allocated: swap hedge token -> USDC
   - If under-allocated: swap USDC -> hedge token
5. All swaps include builder codes
6. Update `PortfolioStore` with new tx hashes
7. Return rebalance summary

### 4.5 clawvault_harvest_yield

**Purpose:** Claim yield from the vault, skim management fee, report revenue.

```typescript
{
  name: "clawvault_harvest_yield",
  description: `Harvest accrued yield from the SavingsVault. A management fee
    (configurable, default 2%) is sent to the agent's operating wallet to
    fund compute costs. Remaining yield stays in the user's portfolio.`,
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      planId: {
        type: "string",
        description: "The plan ID to harvest yield for"
      }
    },
    required: ["planId"]
  }
}
```

**Execution Logic:**
1. Call `vault.drip()` to simulate yield accrual (hackathon)
2. Call `vault.pendingYield(userAddress)` to check available yield
3. Call `vault.harvest(userAddress)` — contract splits yield:
   - `managementFeeBps` portion -> agent wallet
   - Remainder -> stays in vault for user
4. Record revenue in `CostTracker`
5. All transactions include builder codes
6. Return harvest summary: yield amount, fee taken, net to user

---

## 5. Smart Contracts

### 5.1 HedgeToken.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract HedgeToken is ERC20, Ownable {
    address public router;

    constructor(
        string memory name_,
        string memory symbol_,
        address router_
    ) ERC20(name_, symbol_) Ownable(msg.sender) {
        router = router_;
    }

    function setRouter(address router_) external onlyOwner {
        router = router_;
    }

    function mint(address to, uint256 amount) external {
        require(msg.sender == router, "only router");
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external {
        require(msg.sender == router, "only router");
        _burn(from, amount);
    }
}
```

**Deployments (3 instances):**

| Symbol | Name | Represents |
|--------|------|-----------|
| `RE-HEDGE` | Real Estate Hedge | Housing price index exposure |
| `SP-HEDGE` | Equity Hedge | S&P 500 index exposure |
| `BOND-HEDGE` | Bond Hedge | Treasury bond index exposure |

### 5.2 SavingsVault.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract SavingsVault is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public usdc;
    address public agentWallet;
    uint256 public managementFeeBps; // basis points (200 = 2%)

    // Per-user deposit tracking
    mapping(address => uint256) public deposits;
    mapping(address => uint256) public lastDripTimestamp;

    // Yield simulation parameters
    uint256 public annualYieldBps; // e.g. 1000 = 10% APY (accelerated for demo)
    uint256 public totalDeposits;

    // Accumulated yield available for harvest
    mapping(address => uint256) public pendingYield;

    event Deposited(address indexed user, uint256 amount);
    event Dripped(address indexed user, uint256 yieldAmount);
    event Harvested(address indexed user, uint256 userAmount, uint256 feeAmount);

    constructor(
        address usdc_,
        address agentWallet_,
        uint256 managementFeeBps_,
        uint256 annualYieldBps_
    ) Ownable(msg.sender) {
        usdc = IERC20(usdc_);
        agentWallet = agentWallet_;
        managementFeeBps = managementFeeBps_;
        annualYieldBps = annualYieldBps_;
    }

    function deposit(uint256 amount) external {
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        deposits[msg.sender] += amount;
        totalDeposits += amount;
        if (lastDripTimestamp[msg.sender] == 0) {
            lastDripTimestamp[msg.sender] = block.timestamp;
        }
        emit Deposited(msg.sender, amount);
    }

    /// @notice Accrue simulated yield for a user based on time elapsed.
    ///         Callable by anyone (the agent calls it periodically).
    function drip(address user) external {
        uint256 elapsed = block.timestamp - lastDripTimestamp[user];
        if (elapsed == 0 || deposits[user] == 0) return;

        // yield = deposits * annualYieldBps / 10000 * elapsed / 365 days
        uint256 yieldAmount = (deposits[user] * annualYieldBps * elapsed)
            / (10000 * 365 days);

        pendingYield[user] += yieldAmount;
        lastDripTimestamp[user] = block.timestamp;
        emit Dripped(user, yieldAmount);
    }

    /// @notice Harvest pending yield. Splits between user and agent fee.
    function harvest(address user) external {
        uint256 yield_ = pendingYield[user];
        require(yield_ > 0, "no yield");
        pendingYield[user] = 0;

        uint256 fee = (yield_ * managementFeeBps) / 10000;
        uint256 userAmount = yield_ - fee;

        // Vault must hold enough USDC (funded at deploy or via drip mint)
        if (userAmount > 0) {
            usdc.safeTransfer(user, userAmount);
        }
        if (fee > 0) {
            usdc.safeTransfer(agentWallet, fee);
        }

        emit Harvested(user, userAmount, fee);
    }

    /// @notice Owner can fund the vault with USDC to cover yield payouts
    function fund(uint256 amount) external {
        usdc.safeTransferFrom(msg.sender, address(this), amount);
    }

    function setAgentWallet(address agentWallet_) external onlyOwner {
        agentWallet = agentWallet_;
    }

    function setManagementFeeBps(uint256 bps) external onlyOwner {
        require(bps <= 1000, "max 10%");
        managementFeeBps = bps;
    }

    function setAnnualYieldBps(uint256 bps) external onlyOwner {
        annualYieldBps = bps;
    }
}
```

**Key Design Decisions:**
- `drip()` is separate from `harvest()` so yield accrues based on real time but can be claimed at any point
- `annualYieldBps` is set high for hackathon demo (e.g., 5000 = 50% APY) to demonstrate self-sustainability quickly
- Vault must be pre-funded with extra USDC to cover yield payouts (hackathon simplification)

### 5.3 HedgeRouter.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IMintBurn {
    function mint(address to, uint256 amount) external;
    function burn(address from, uint256 amount) external;
}

contract HedgeRouter is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public usdc;

    // token address => price in USDC (6 decimals, since USDC is 6 decimals)
    // e.g. 1_000_000 = 1 hedge token costs 1 USDC
    mapping(address => uint256) public prices;
    mapping(address => bool) public supportedTokens;

    event Swapped(
        address indexed user,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );
    event PriceSet(address indexed token, uint256 price);

    constructor(address usdc_) Ownable(msg.sender) {
        usdc = IERC20(usdc_);
    }

    function addToken(address token, uint256 priceInUsdc) external onlyOwner {
        supportedTokens[token] = true;
        prices[token] = priceInUsdc;
        emit PriceSet(token, priceInUsdc);
    }

    function setPrice(address token, uint256 priceInUsdc) external onlyOwner {
        require(supportedTokens[token], "unsupported");
        prices[token] = priceInUsdc;
        emit PriceSet(token, priceInUsdc);
    }

    /// @notice Swap USDC -> hedge token (buy hedge)
    function buyHedge(address hedgeToken, uint256 usdcAmount) external {
        require(supportedTokens[hedgeToken], "unsupported");
        require(prices[hedgeToken] > 0, "no price");

        // Calculate hedge tokens received: usdcAmount / price
        // Both USDC and hedge tokens use 18 decimals for hedge, 6 for USDC
        // hedgeAmount = usdcAmount * 1e18 / price
        uint256 hedgeAmount = (usdcAmount * 1e18) / prices[hedgeToken];

        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);
        IMintBurn(hedgeToken).mint(msg.sender, hedgeAmount);

        emit Swapped(msg.sender, address(usdc), hedgeToken, usdcAmount, hedgeAmount);
    }

    /// @notice Swap hedge token -> USDC (sell hedge)
    function sellHedge(address hedgeToken, uint256 hedgeAmount) external {
        require(supportedTokens[hedgeToken], "unsupported");
        require(prices[hedgeToken] > 0, "no price");

        // usdcAmount = hedgeAmount * price / 1e18
        uint256 usdcAmount = (hedgeAmount * prices[hedgeToken]) / 1e18;

        IMintBurn(hedgeToken).burn(msg.sender, hedgeAmount);
        usdc.safeTransfer(msg.sender, usdcAmount);

        emit Swapped(msg.sender, hedgeToken, address(usdc), hedgeAmount, usdcAmount);
    }

    /// @notice Get the current price of a hedge token in USDC
    function getPrice(address hedgeToken) external view returns (uint256) {
        return prices[hedgeToken];
    }

    /// @notice Fund router with USDC to cover sellHedge payouts
    function fund(uint256 amount) external {
        usdc.safeTransferFrom(msg.sender, address(this), amount);
    }
}
```

### Contract Deployment Parameters

| Contract | Constructor Args |
|----------|-----------------|
| HedgeRouter | `usdc = 0x... (MockUSDC on Base Sepolia)` (USDC on Base) |
| HedgeToken (RE) | `"Real Estate Hedge", "RE-HEDGE", routerAddress` |
| HedgeToken (SP) | `"Equity Hedge", "SP-HEDGE", routerAddress` |
| HedgeToken (BOND) | `"Bond Hedge", "BOND-HEDGE", routerAddress` |
| SavingsVault | `usdc, agentWallet, 200 (2%), 5000 (50% APY for demo)` |

**Post-Deploy Steps:**
1. `router.addToken(reHedge, 1_000_000)` — 1 RE-HEDGE = 1 USDC initially
2. `router.addToken(spHedge, 1_000_000)` — 1 SP-HEDGE = 1 USDC initially
3. `router.addToken(bondHedge, 1_000_000)` — 1 BOND-HEDGE = 1 USDC initially
4. Fund router with USDC for sell liquidity
5. Fund vault with extra USDC for yield payouts

---

## 6. ERC-8021 Builder Codes

### Registration

Register the builder code `clawvault` on [base.dev](https://base.dev). This maps the code to the agent's payout address in the on-chain registry.

### Implementation

```typescript
// lib/builder-codes.ts

const ERC_8021_MARKER = "8021802180218021802180218021802180218021";

/**
 * Encode a builder code as an ERC-8021 calldata suffix.
 *
 * Format (appended to end of calldata):
 *   [codesLength: 1 byte][codes: N bytes ASCII][schemaId: 1 byte][marker: 16 bytes]
 *
 * Schema 0: single builder code, no delimiter needed.
 */
export function encodeBuilderCodeSuffix(builderCode: string): `0x${string}` {
  const codeBytes = Buffer.from(builderCode, "ascii");
  const codesLength = codeBytes.length.toString(16).padStart(2, "0");
  const codesHex = codeBytes.toString("hex");
  const schemaId = "00";
  return `0x${codesLength}${codesHex}${schemaId}${ERC_8021_MARKER}`;
}

/**
 * Append builder code suffix to existing calldata.
 */
export function appendBuilderCode(
  calldata: `0x${string}`,
  builderCode: string
): `0x${string}` {
  const suffix = encodeBuilderCodeSuffix(builderCode);
  // Remove 0x prefix from suffix before concatenating
  return `${calldata}${suffix.slice(2)}` as `0x${string}`;
}
```

### Usage in Transactions

Every transaction sent by the agent uses a custom `sendTransaction` wrapper:

```typescript
// lib/base-client.ts (excerpt)

import { appendBuilderCode } from "./builder-codes.js";

export async function sendTxWithBuilderCode(
  walletClient: WalletClient,
  tx: { to: Address; data: `0x${string}`; value?: bigint },
  builderCode: string
): Promise<Hash> {
  const dataWithCode = appendBuilderCode(tx.data, builderCode);
  return walletClient.sendTransaction({
    ...tx,
    data: dataWithCode,
  });
}
```

### Verification

Builder codes are verifiable by parsing the last bytes of any transaction's calldata on BaseScan. The `8021...8021` marker makes them identifiable.

---

## 7. ERC-8004 Agent Identity (P1)

### Registration

Register the ClawVault agent in the ERC-8004 Identity Registry on Base:

```typescript
// One-time registration script
const agentURI = "https://your-dashboard-url.com/agent.json";

const tx = await identityRegistry.write.register([agentURI, [
  { metadataKey: "type", metadataValue: toHex("savings-advisor") },
  { metadataKey: "chain", metadataValue: toHex("base") },
]]);
```

### Agent Registration File

Host at the dashboard's public URL:

```json
{
  "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
  "name": "ClawVault",
  "description": "Autonomous AI savings advisor managing onchain portfolios on Base",
  "image": "",
  "services": [
    {
      "name": "MCP",
      "endpoint": "https://your-dashboard-url.com/mcp",
      "skills": ["savings-planning", "portfolio-management", "yield-harvesting"]
    }
  ],
  "x402Support": true,
  "active": true,
  "registrations": [
    {
      "agentId": 0,
      "agentRegistry": "eip155:8453:<identity-registry-address>"
    }
  ],
  "supportedTrust": ["reputation"]
}
```

---

## 8. x402 Integration (P1)

### Concept

Expose a premium analytics API endpoint behind an x402 paywall. When another agent or user hits the endpoint, they automatically pay a small USDC amount, generating additional revenue for the agent.

### Implementation

```typescript
// In dashboard-server.ts, add a premium endpoint:

// Free endpoint (for judges)
app.get("/api/stats", (req, res) => {
  res.json(getBasicStats());
});

// Premium endpoint (x402 paywall)
app.get("/api/analytics", x402Middleware({
  price: "0.01", // 0.01 USDC per request
  network: "eip155:8453", // Base
  payTo: agentWalletAddress,
}), (req, res) => {
  res.json(getDetailedAnalytics());
});
```

The x402 middleware returns HTTP 402 with payment instructions if the request doesn't include a valid `PAYMENT-SIGNATURE` header. Clients using x402-compatible SDKs handle payment automatically.

---

## 9. Self-Sustainability Engine

### Cost Tracking

```typescript
// lib/cost-tracker.ts

interface CostEntry {
  timestamp: number;
  action: string;      // "create_plan" | "rebalance" | "harvest" | etc.
  estimatedCostUsd: number;
  gasUsedWei?: string;
  gasCostUsd?: number;
  txHash?: string;
}

interface RevenueEntry {
  timestamp: number;
  source: string;       // "management_fee" | "x402"
  amountUsdc: number;
  txHash?: string;
}

class CostTracker {
  private dataPath: string;

  // Costs
  recordComputeCost(action: string, estimatedCostUsd: number): void;
  recordGasCost(txHash: string, gasUsedWei: string, gasCostUsd: number): void;

  // Revenue
  recordRevenue(source: string, amountUsdc: number, txHash?: string): void;

  // Queries
  getTotalComputeCost(): number;
  getTotalGasCost(): number;
  getTotalRevenue(): number;
  getNetBalance(): number; // revenue - costs
  isSelfSustaining(): boolean; // revenue >= costs
  getRecentEntries(limit: number): (CostEntry | RevenueEntry)[];

  // Persistence
  save(): void;
  load(): void;
}
```

### Compute Cost Estimation

Since we can't directly meter OpenClaw's LLM calls from within a plugin, we estimate based on tool invocations:

| Tool Call | Estimated Cost |
|-----------|---------------|
| `clawvault_create_plan` | $0.03 (involves LLM reasoning) |
| `clawvault_execute_trades` | $0.01 (mostly onchain, minimal LLM) |
| `clawvault_check_portfolio` | $0.01 |
| `clawvault_rebalance` | $0.02 (LLM decides whether to trade) |
| `clawvault_harvest_yield` | $0.01 |
| Autonomous loop iteration (no trade) | $0.005 |

### Autonomous Loop

```typescript
// services/autonomous-loop.ts

export function startAutonomousLoop(ctx: PluginContext): () => void {
  const intervalMs = (ctx.config.rebalanceIntervalMinutes ?? 60) * 60 * 1000;

  const interval = setInterval(async () => {
    const plans = ctx.store.getAllPlans();

    for (const plan of plans) {
      // 1. Drip yield
      await dripYield(ctx, plan);

      // 2. Check if harvest is worthwhile
      const pendingYield = await getPendingYield(ctx, plan);
      if (pendingYield > MIN_HARVEST_AMOUNT) {
        await harvestYield(ctx, plan);
      }

      // 3. Check drift and rebalance if needed
      const drift = await checkDrift(ctx, plan);
      if (drift > ctx.config.rebalanceThresholdPercent) {
        await rebalance(ctx, plan);
      }

      // 4. Track compute cost for this iteration
      ctx.costTracker.recordComputeCost("autonomous_loop", 0.005);
    }
  }, intervalMs);

  return () => clearInterval(interval);
}
```

---

## 10. Dashboard Service

### HTTP Server

```typescript
// services/dashboard-server.ts

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export function startDashboardServer(ctx: PluginContext): () => void {
  const port = ctx.config.dashboardPort ?? 3402;

  const server = createServer(async (req, res) => {
    // CORS headers for public access
    res.setHeader("Access-Control-Allow-Origin", "*");

    if (req.url === "/" || req.url === "/index.html") {
      const html = readFileSync(join(__dirname, "../../frontend/index.html"), "utf-8");
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html);
    }
    else if (req.url === "/api/stats") {
      const stats = await getStats(ctx);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(stats));
    }
    else if (req.url === "/api/transactions") {
      const txs = ctx.store.getRecentTransactions(50);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(txs));
    }
    else if (req.url === "/api/plans") {
      const plans = ctx.store.getAllPlans();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(plans));
    }
    else {
      res.writeHead(404);
      res.end("Not found");
    }
  });

  server.listen(port, () => {
    console.log(`[clawvault] Dashboard running at http://localhost:${port}`);
  });

  return () => server.close();
}
```

### API Response: /api/stats

```json
{
  "agentAddress": "0x...",
  "walletBalances": {
    "ethWei": "1000000000000000",
    "ethUsd": 3.50,
    "usdcRaw": "5000000",
    "usdcFormatted": 5.00
  },
  "sustainability": {
    "totalRevenue": 2.50,
    "totalComputeCost": 1.80,
    "totalGasCost": 0.15,
    "netBalance": 0.55,
    "isSelfSustaining": true
  },
  "portfolio": {
    "totalManagedUsdc": 1000.00,
    "activePlans": 2,
    "lastRebalance": "2026-02-19T10:30:00Z",
    "lastHarvest": "2026-02-19T09:00:00Z"
  },
  "uptime": {
    "startedAt": "2026-02-18T14:00:00Z",
    "autonomousActions": 47,
    "transactionsExecuted": 23
  }
}
```

### Dashboard HTML

Single-page app with sections:
- **Header**: Agent name, wallet address, BaseScan link
- **Sustainability Card**: Revenue vs Cost bar chart, green/red indicator
- **Wallet Balances**: ETH and USDC balances
- **Plans Table**: Active savings plans with allocations
- **Transactions Table**: Recent txs with BaseScan links
- **Cost Log**: Recent compute/gas costs

Uses `fetch("/api/stats")` on load and every 30 seconds. No framework — vanilla HTML/CSS/JS. Styled with a clean dark theme to look polished.

---

## 11. Data Models & Persistence

### File-Based Store

All data persisted as JSON files in a configurable data directory:

```
~/.clawvault/
├── plans.json            # All savings plans
├── transactions.json     # Transaction history
├── costs.json            # Compute + gas cost log
└── revenue.json          # Revenue log
```

### Types

```typescript
// lib/types.ts

interface SavingsPlan {
  planId: string;
  userAddress: string;
  goal: string;
  timeline: string;
  riskLevel: "low" | "medium" | "medium-high" | "high";
  allocation: {
    stable: number;           // percentage
    realEstateHedge: number;
    equityHedge: number;
    bondHedge: number;
  };
  depositAmountUsdc: number;
  status: "created" | "active" | "rebalancing" | "closed";
  createdAt: number;          // unix timestamp
  lastRebalancedAt?: number;
  lastHarvestedAt?: number;
  transactions: string[];     // tx hashes
}

interface TransactionRecord {
  txHash: string;
  planId: string;
  type: "deposit" | "swap_buy" | "swap_sell" | "harvest" | "rebalance" | "approve";
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  gasCostUsd: number;
  timestamp: number;
  builderCodeIncluded: boolean;
}

interface ContractAddresses {
  usdc: `0x${string}`;
  savingsVault: `0x${string}`;
  hedgeRouter: `0x${string}`;
  reHedge: `0x${string}`;
  spHedge: `0x${string}`;
  bondHedge: `0x${string}`;
}
```

---

## 12. Configuration

### Environment Variables

```env
# Required
CLAWVAULT_PRIVATE_KEY=0x...    # Agent wallet private key

# Optional (have defaults)
BASE_RPC_URL=https://sepolia.base.org
BUILDER_CODE=clawvault
DASHBOARD_PORT=3402
REBALANCE_INTERVAL_MINUTES=60
REBALANCE_THRESHOLD_PERCENT=5
MANAGEMENT_FEE_BPS=200
```

### Contract Addresses

Stored in `agent/lib/contracts.ts` after deployment. Updated once during initial setup.

```typescript
export const ADDRESSES: ContractAddresses = {
  usdc: "0x... (MockUSDC on Base Sepolia)",  // USDC on Base Sepolia
  savingsVault: "0x...",   // deployed
  hedgeRouter: "0x...",    // deployed
  reHedge: "0x...",        // deployed
  spHedge: "0x...",        // deployed
  bondHedge: "0x...",      // deployed
};

// For Anvil local dev, use different addresses (output from deploy script)
export const ANVIL_ADDRESSES: ContractAddresses = {
  usdc: "0x...",           // MockUSDC deployed to Anvil
  savingsVault: "0x...",
  hedgeRouter: "0x...",
  reHedge: "0x...",
  spHedge: "0x...",
  bondHedge: "0x...",
};
```

---

## 13. Deployment Guide

### Prerequisites

1. Node.js 20+
2. Foundry (for contract deployment)
3. OpenClaw installed and running
4. Agent wallet funded with:
   - ~0.01 ETH on Base (for gas, ~$35 worth, lasts thousands of txs)
   - ~$50 USDC on Base (for initial contract funding + demo trades)
5. Builder code registered on base.dev

### Step 1: Install Dependencies

```bash
cd clawvault
npm install           # installs agent + frontend workspaces
```

### Step 2: Deploy Smart Contracts (Anvil for local dev)

```bash
# Terminal 1: Start Anvil
cd clawvault/contracts
anvil

# Terminal 2: Deploy contracts to Anvil
cd clawvault/contracts
forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 \
  --broadcast --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

For Base Sepolia:
```bash
cd clawvault/contracts
forge script script/Deploy.s.sol --rpc-url https://sepolia.base.org \
  --broadcast --private-key $CLAWVAULT_PRIVATE_KEY
```

Update `agent/lib/contracts.ts` with deployed addresses.

### Step 3: Fund Contracts

```bash
# Fund router with USDC for sell liquidity
# Fund vault with extra USDC for yield payouts
# (done via deploy script or separate funding script)
```

### Step 4: Install Plugin

```bash
# Point OpenClaw to the agent/ subfolder (that's where the plugin manifest lives)
openclaw plugins install -l /path/to/clawvault/agent
openclaw plugins enable clawvault
openclaw gateway restart
openclaw plugins list   # verify
```

### Step 4: Expose Dashboard

```bash
# Option A: ngrok
ngrok http 3402

# Option B: Cloudflare tunnel
cloudflared tunnel --url http://localhost:3402
```

Share the public URL with judges.

### Step 5: Test

Message the OpenClaw agent:
> "I want to save for a house in 3-5 years. I have 100 USDC to start."

The agent should:
1. Call `clawvault_create_plan`
2. Call `clawvault_execute_trades`
3. Confirm trades executed with tx hashes
4. Dashboard should update with new plan and transactions

---

## 14. Dependencies

### Runtime (npm)

| Package | Purpose |
|---------|---------|
| `viem` | Ethereum/Base client, ABI encoding, transaction signing |

No other runtime dependencies needed. `viem` handles everything we need for onchain interaction. The plugin uses Node.js built-ins (`node:http`, `node:fs`, `node:path`, `node:crypto`) for the dashboard server and persistence.

### Development

| Tool | Purpose |
|------|---------|
| Foundry (`forge`, `cast`) | Solidity compilation, testing, deployment |
| `npx tsx` | Run TypeScript directly for testing |

### Onchain

| Contract/Protocol | Address on Base | Purpose |
|-------------------|-----------------|---------|
| USDC | `0x... (MockUSDC on Base Sepolia)` | Base currency for all operations |
| ERC-8004 Identity Registry | TBD (check base deployment) | Agent identity registration |
| ERC-8021 Builder Registry | TBD (register on base.dev) | Builder code payout mapping |

---

## Appendix A: Transaction Flow Diagram

```
User: "Save for a house, 3-5 years, 100 USDC"
         │
         ▼
┌─────────────────┐
│ clawvault_create_  │
│ plan             │──► Returns plan: 50/25/20/5 allocation
└────────┬────────┘
         │
         ▼
┌─────────────────┐    ┌──────────────┐
│ clawvault_execute_ │    │  Base Sepolia │
│ trades           │──► │              │
└────────┬────────┘    │  1. approve() │
         │              │  2. vault.    │
         │              │     deposit() │
         │              │  3. router.   │
         │              │     buyHedge()│  All txs have
         │              │     (x3)     │◄── builder codes
         │              └──────────────┘
         │
         ▼
   Plan status: "active"
         │
         │  (every 60 min, autonomous)
         ▼
┌─────────────────┐    ┌──────────────┐
│ autonomous_loop  │──► │  drip()      │
│                  │    │  harvest()   │──► fee → agent wallet
│                  │    │  rebalance() │      → pays compute
└─────────────────┘    └──────────────┘
```

## Appendix B: Builder Code Calldata Example

For builder code `clawvault` (13 bytes):

```
Original calldata: 0xa9059cbb000000000000000000000000...
Suffix:            0d736176696e67736167656e7400 8021802180218021802180218021802180218021
                   ^^ ^^^^^^^^^^^^^^^^^^^^^^^^ ^^ ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                   |  |                        |  |
                   |  "clawvault" (hex)      |  ERC-8021 marker (16 bytes)
                   codesLength (13)             schemaId (0)
```

Full tx calldata = `original + suffix`
