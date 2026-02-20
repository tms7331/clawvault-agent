# ClawVault: Product Requirements Document

## Project Overview

**Name:** ClawVault
**Type:** OpenClaw Plugin (TypeScript)
**Chain:** Base Sepolia
**Hackathon:** Base Self-Sustaining Autonomous Agents ($10,000 Prize)
**Tagline:** An autonomous AI savings advisor that manages onchain portfolios and funds its own compute through management fees.

---

## Problem Statement

Managing a diversified savings strategy is complex. Users need to:
- Decide on asset allocations based on their goals and timeline
- Execute trades across multiple instruments
- Rebalance periodically as allocations drift
- Harvest yield and reinvest

Today this requires manual effort or expensive human advisors. An autonomous onchain agent can do this 24/7, transparently, and fund itself through the value it creates.

---

## User Stories

### Primary User (Saver)

1. **As a saver**, I want to describe my savings goal in plain English (e.g., "I'm saving for a house in 3-5 years") so the agent understands my risk tolerance and timeline.

2. **As a saver**, I want the agent to propose an allocation plan (e.g., 50% stablecoins, 25% real estate hedge, 25% equity hedge) so I can review it before funds are deployed.

3. **As a saver**, I want the agent to execute onchain trades to match my target allocation so my funds are deployed without manual effort.

4. **As a saver**, I want the agent to periodically rebalance my portfolio when allocations drift beyond a threshold so my risk profile stays consistent.

5. **As a saver**, I want the agent to harvest yield from my stable positions and reinvest it so my savings compound.

### Operator / Judge

6. **As a judge**, I want to visit a public URL and immediately see the agent's wallet balance, compute costs, and revenue without logging in.

7. **As an operator**, I want to see a history of all onchain transactions with BaseScan links so I can verify builder codes are embedded.

8. **As a judge**, I want to see whether the agent is self-sustaining (revenue >= compute costs) at a glance.

---

## Feature Requirements

### P0 (Must Have for Hackathon)

| ID | Feature | Description |
|----|---------|-------------|
| F1 | **Savings Plan Creation** | Agent tool that takes a natural language goal description and returns a structured allocation plan with percentages per asset class. |
| F2 | **Trade Execution** | Agent tool that takes an allocation plan and executes onchain swaps on Base to match target allocation. Every transaction includes ERC-8021 builder codes. |
| F3 | **Portfolio Status** | Agent tool that reads current onchain balances and compares them to the target allocation, reporting drift and P&L. |
| F4 | **Builder Codes** | Every onchain transaction appends the ERC-8021 builder code suffix to calldata. Register a builder code on base.dev. |
| F5 | **Public Dashboard** | A web page at a public URL showing: wallet balance (ETH + USDC), cumulative compute costs, cumulative fee revenue, net sustainability status, recent transactions with BaseScan links. No authentication required. |
| F6 | **Cost Tracking** | Track every LLM API call and its estimated cost. Persist to disk. Expose via dashboard. |
| F7 | **Yield Harvesting** | Agent tool that claims yield from the savings vault and skims a management fee to the agent's operating wallet. |
| F8 | **Mock Smart Contracts** | Deploy on Base Sepolia: HedgeToken (ERC-20, multiple instances for different asset classes), SavingsVault (simplified yield vault with drip function), HedgeRouter (swap USDC <-> hedge tokens). |
| F9 | **Autonomous Rebalancing** | A background service that periodically checks portfolio drift and triggers rebalance trades without human intervention. |

### P1 (Should Have)

| ID | Feature | Description |
|----|---------|-------------|
| F10 | **ERC-8004 Agent Registration** | Register the agent in the ERC-8004 Identity Registry with an agent URI and metadata, giving it a verifiable onchain identity. |
| F11 | **x402 Integration** | Expose the dashboard stats API behind an x402 paywall for premium analytics, demonstrating the agent can also earn revenue via pay-per-request. |
| F12 | **Multi-User Support** | Track multiple savings plans per user address. Each plan has its own target allocation. |
| F13 | **Transaction History** | Persistent log of all transactions with timestamps, types, amounts, tx hashes, and gas costs. |

### P2 (Nice to Have)

| ID | Feature | Description |
|----|---------|-------------|
| F14 | **Agent-to-Agent Commerce** | The ClawVault agent can call other agents' x402 endpoints (e.g., a price oracle agent) and pay for data. |
| F15 | **Risk Scoring** | More sophisticated plan creation that considers volatility, correlation, and Sharpe ratio. |
| F16 | **Notification Service** | Alert the user when rebalancing occurs or when the portfolio hits a milestone. |

---

## Hackathon Judging Criteria Mapping

| Judging Criterion | How We Address It |
|-------------------|-------------------|
| **How autonomous is the agent?** | Background service runs rebalancing + yield harvesting on a schedule. No human intervention needed after initial plan setup. |
| **Is it self-sustaining?** | Management fee (1-2%) on yield harvested from the savings vault covers compute costs. Dashboard shows revenue vs. costs in real-time. |
| **Does it implement builder codes?** | Every onchain transaction appends ERC-8021 builder code suffix. Verifiable on BaseScan. |
| **Is performance clear from the UI?** | Public dashboard shows wallet balance, compute costs, fee revenue, sustainability ratio, portfolio status, and transaction history. |
| **Net new and unique methods?** | Novel approach: AI-driven savings advisor that creates personalized hedging strategies using onchain derivatives, self-funded through yield management fees. Not a simple trading bot. |

---

## Self-Sustainability Economic Model

### Revenue Sources

1. **Management Fee on Yield** (Primary)
   - The SavingsVault generates yield (simulated via `drip()` for hackathon)
   - Agent harvests yield periodically
   - 1-2% of harvested yield goes to agent's operating wallet
   - Remaining yield stays in the user's portfolio

2. **x402 Premium API** (Secondary, P1)
   - Detailed analytics endpoint behind x402 paywall
   - Each request pays a small amount in USDC

### Cost Structure

| Cost | Estimate |
|------|----------|
| LLM API calls (plan creation, rebalancing decisions) | ~$0.01-0.05 per call |
| Base gas fees | ~$0.001 per transaction |
| Dashboard hosting | Free (runs as OpenClaw service) |

### Break-Even Analysis

- If managing $1,000 in the vault at 5% simulated APY = $50/year yield
- 2% management fee = $1.00/year from that user
- At ~$0.03 per agent action, $1.00 covers ~33 actions
- With periodic rebalancing (daily check, weekly trade) = ~52 trades/year + 365 checks
- Need ~$12.50/year in compute at that cadence
- Break-even at ~$12,500 managed assets per user at 5% yield with 2% fee
- For hackathon demo: the `drip()` function can simulate higher yield to demonstrate the loop

---

## Smart Contract Requirements

### HedgeToken.sol
- Standard ERC-20
- `mint(address to, uint256 amount)` - only callable by HedgeRouter
- `burn(address from, uint256 amount)` - only callable by HedgeRouter
- Deploy instances: `RE-HEDGE` (Real Estate), `SP-HEDGE` (S&P 500), `BOND-HEDGE` (Bond Index)

### SavingsVault.sol
- Accepts USDC deposits
- Tracks balances per user address
- `drip()` function callable by anyone — mints simulated yield proportional to deposits and time elapsed
- `harvest(address user)` — withdraws accrued yield to user
- `managementFee` state variable (basis points) — percentage of yield sent to agent wallet on harvest
- Agent wallet address set at deploy time

### HedgeRouter.sol
- `swap(address tokenIn, address tokenOut, uint256 amountIn)` — swaps between USDC and hedge tokens
- Prices set by owner (simulating an oracle) via `setPrice(address token, uint256 priceInUsdc)`
- No real liquidity pool — just mints/burns hedge tokens against USDC deposits
- Simple and predictable for hackathon demo purposes

---

## Dashboard Requirements

### Layout
Single page, no navigation needed. Sections from top to bottom:

1. **Header**: "ClawVault" + agent wallet address (linked to BaseScan)
2. **Sustainability Status**: Large card showing:
   - Total Revenue (fees collected)
   - Total Compute Cost
   - Net (revenue - cost), colored green if positive
   - "Self-Sustaining: YES/NO" badge
3. **Wallet Balances**: ETH balance, USDC balance
4. **Active Plans**: Table of savings plans with goal, target allocation, current allocation, drift %
5. **Recent Transactions**: Table with timestamp, type (swap/deposit/harvest/rebalance), tx hash (linked to BaseScan), gas cost
6. **Cost Breakdown**: Table of recent LLM calls with timestamp, action type, token count, estimated cost

### Technical
- Static HTML + vanilla JS (no framework needed)
- Fetches data from a JSON API served by the plugin's registered service
- Auto-refreshes every 30 seconds
- Mobile-responsive (judges may view on phone)

---

## Repository Structure

The project is organized as a **monorepo** with three independent packages in a single git repo:

```
clawvault/                     # Monorepo root
├── package.json                  # Root: npm workspaces config
├── .gitignore
├── PRD.md
├── TECHNICAL_SPEC.md
│
├── agent/                        # OpenClaw plugin (TypeScript)
│   ├── package.json              # Plugin manifest with openclaw.extensions
│   ├── openclaw.plugin.json      # OpenClaw metadata + configSchema
│   ├── index.ts                  # Entry point: registers tools + services
│   ├── tools/                    # Agent tool implementations
│   ├── lib/                      # Shared libraries (viem client, builder codes, etc.)
│   ├── services/                 # Background loop + dashboard HTTP server
│   └── test.ts                   # Local tool tests
│
├── frontend/                     # Public dashboard (HTML/CSS/JS)
│   ├── index.html                # Single-page dashboard
│   └── package.json              # (minimal, for workspace)
│
└── contracts/                    # Solidity smart contracts (Foundry)
    ├── foundry.toml
    ├── src/                      # HedgeToken, SavingsVault, HedgeRouter
    ├── script/                   # Deploy script
    └── test/                     # Contract tests
```

**Why monorepo?**
- The agent imports contract ABIs from `contracts/out/` after Foundry builds
- The agent's dashboard service serves files from `frontend/`
- Single repo to share with judges
- npm workspaces links the packages cleanly
- Foundry is self-contained in `contracts/` with its own `foundry.toml`

**Development with Anvil:**
- `contracts/` uses Foundry with Anvil for local testing
- Deploy script works against both Anvil (local) and Base Sepolia
- Agent's RPC URL is configurable: point to `http://127.0.0.1:8545` for Anvil or `https://sepolia.base.org` for production

---

## Scope Boundaries

### In Scope (Hackathon)
- Single-chain (Base Sepolia only, Anvil for local dev)
- Mock hedge instruments (not real derivatives)
- Simulated yield (drip function)
- Single agent wallet (private key in env var)
- File-based persistence (JSON files on disk)
- Simple dashboard (HTML/CSS/JS, no framework)
- Monorepo with agent/, frontend/, contracts/

### Out of Scope
- Multi-chain support
- Real derivatives/options contracts
- Production key management (KMS, HSM)
- Database persistence
- User authentication
- Real yield sources (Aave, Morpho integration)
- Mobile app

---

## Success Metrics (Demo Day)

1. Agent creates a savings plan from a natural language description
2. Agent executes trades on Base Sepolia to match the plan
3. Every transaction has builder codes (verifiable on BaseScan)
4. Vault generates yield, agent harvests it, skims fee
5. Dashboard shows revenue > compute cost (self-sustaining)
6. All of this happens with zero human intervention after initial setup
7. Dashboard is live at a public URL, no login required

---

## Open Questions / Risks

| Risk | Mitigation |
|------|------------|
| Builder code registration on base.dev may have a waitlist | Register immediately. If blocked, use a placeholder code and document the attempt. |
| Base Sepolia requires real ETH for gas | Pre-fund agent wallet with small amount (~$5 of ETH). Base gas is very cheap (~$0.001/tx). |
| Mock contracts need initial liquidity | Fund HedgeRouter with USDC and mint initial hedge token supply at deploy time. |
| OpenClaw `api.registerService()` may not support HTTP servers | Fallback: run dashboard as a separate process started by the plugin. |
| Yield simulation may look "fake" to judges | Be transparent in dashboard: label it "Simulated Yield (Hackathon Demo)" and explain in README. |
| Private key security | Use environment variable. Add .env to .gitignore. Note in docs that production would use KMS. |
