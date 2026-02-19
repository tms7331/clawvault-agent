import type { PluginContext, SavingsPlan } from "../lib/types.js";

interface AllocationResult {
  stable: number;
  realEstateHedge: number;
  equityHedge: number;
  bondHedge: number;
}

function parseTimeline(goal: string): number {
  // Extract years from goal text
  const patterns = [
    /(\d+)\s*-\s*(\d+)\s*years?/i,
    /(\d+)\s*years?/i,
    /next\s*(\d+)/i,
  ];

  for (const pattern of patterns) {
    const match = goal.match(pattern);
    if (match) {
      // If range like "3-5 years", take the average
      if (match[2]) {
        return (parseInt(match[1]) + parseInt(match[2])) / 2;
      }
      return parseInt(match[1]);
    }
  }

  // Default keywords
  if (/short.?term|soon|immedia/i.test(goal)) return 1;
  if (/medium.?term/i.test(goal)) return 5;
  if (/long.?term|retire/i.test(goal)) return 15;

  return 5; // default
}

function determineRiskLevel(
  years: number
): SavingsPlan["riskLevel"] {
  if (years < 2) return "low";
  if (years < 5) return "medium";
  if (years < 10) return "medium-high";
  return "high";
}

function computeAllocation(
  years: number,
  goal: string
): AllocationResult {
  let allocation: AllocationResult;

  if (years < 2) {
    allocation = { stable: 70, realEstateHedge: 10, equityHedge: 10, bondHedge: 10 };
  } else if (years < 5) {
    allocation = { stable: 50, realEstateHedge: 20, equityHedge: 20, bondHedge: 10 };
  } else if (years < 10) {
    allocation = { stable: 30, realEstateHedge: 25, equityHedge: 35, bondHedge: 10 };
  } else {
    allocation = { stable: 20, realEstateHedge: 20, equityHedge: 50, bondHedge: 10 };
  }

  // Boost real estate hedge if goal mentions housing
  if (/house|home|real\s*estate|property|apartment|condo/i.test(goal)) {
    allocation.realEstateHedge += 10;
    allocation.stable -= 10;
  }

  // Boost bonds if goal mentions safety or conservative
  if (/safe|conservat|low\s*risk|preserv/i.test(goal)) {
    allocation.bondHedge += 10;
    allocation.equityHedge -= 10;
  }

  // Boost equity if goal mentions growth or aggressive
  if (/grow|aggress|high\s*return|maxim/i.test(goal)) {
    allocation.equityHedge += 10;
    allocation.stable -= 10;
  }

  // Clamp all values to [0, 100]
  for (const key of Object.keys(allocation) as (keyof AllocationResult)[]) {
    allocation[key] = Math.max(0, Math.min(100, allocation[key]));
  }

  return allocation;
}

export function registerCreatePlan(api: any, ctx: PluginContext) {
  api.registerTool({
    name: "savings_create_plan",
    description:
      "Create a savings plan based on a user's goal description. " +
      "Analyzes the timeline, risk tolerance, and objectives to produce " +
      "a target asset allocation across: stable (USDC in yield vault), " +
      "real estate hedge, equity hedge, and bond hedge. " +
      "Returns the plan with percentage allocations.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        goal: {
          type: "string",
          description:
            "Natural language description of the savings goal, e.g. 'I want to buy a house in 3-5 years'",
        },
        depositAmountUsdc: {
          type: "number",
          description: "Amount of USDC to allocate to this plan",
        },
        userAddress: {
          type: "string",
          description: "The user's wallet address (for tracking)",
        },
      },
      required: ["goal", "depositAmountUsdc", "userAddress"],
    },
    execute: async (_id: string, params: any) => {
      ctx.costTracker.recordComputeCost("create_plan", 0.03);

      const years = parseTimeline(params.goal);
      const riskLevel = determineRiskLevel(years);
      const allocation = computeAllocation(years, params.goal);

      const timelineStr =
        years < 2
          ? "< 2 years"
          : years < 5
            ? "2-5 years"
            : years < 10
              ? "5-10 years"
              : "10+ years";

      const plan = ctx.store.createPlan({
        userAddress: params.userAddress,
        goal: params.goal,
        timeline: timelineStr,
        riskLevel,
        allocation,
        depositAmountUsdc: params.depositAmountUsdc,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(plan, null, 2),
          },
        ],
      };
    },
  });
}
