import { executeRebalance } from "../tools/rebalance.js";
import { executeHarvest } from "../tools/harvest-yield.js";
import type { PluginContext } from "../lib/types.js";

const MIN_HARVEST_USDC = 0.001; // $0.001 minimum to harvest

export function startAutonomousLoop(ctx: PluginContext): () => void {
  const intervalMinutes = ctx.config.rebalanceIntervalMinutes ?? 60;
  const intervalMs = intervalMinutes * 60 * 1000;

  console.log(
    `[savings-agent] Autonomous loop starting (every ${intervalMinutes} min)`
  );

  const interval = setInterval(async () => {
    try {
      const plans = ctx.store.getActivePlans();

      if (plans.length === 0) {
        ctx.costTracker.recordComputeCost("autonomous_loop_idle", 0.001);
        return;
      }

      for (const plan of plans) {
        console.log(
          `[savings-agent] Processing plan ${plan.planId}: ${plan.goal}`
        );

        // 1. Harvest yield (includes drip)
        try {
          const harvestResult = await executeHarvest(ctx, plan.planId);
          if (harvestResult.harvested) {
            console.log(
              `[savings-agent] Harvested ${harvestResult.pendingYield} USDC yield, ` +
                `fee collected: $${harvestResult.feeCollected.toFixed(4)}`
            );
          }
        } catch (err) {
          console.error(
            `[savings-agent] Harvest failed for ${plan.planId}:`,
            err
          );
        }

        // 2. Check drift and rebalance
        try {
          const rebalanceResult = await executeRebalance(ctx, plan.planId);
          if (rebalanceResult.rebalanced) {
            console.log(
              `[savings-agent] Rebalanced ${plan.planId}: ${rebalanceResult.trades.length} trades`
            );
          } else {
            console.log(
              `[savings-agent] No rebalance needed for ${plan.planId} ` +
                `(drift: ${rebalanceResult.maxDrift.toFixed(1)}%)`
            );
          }
        } catch (err) {
          console.error(
            `[savings-agent] Rebalance failed for ${plan.planId}:`,
            err
          );
        }

        // 3. Track cost for this loop iteration
        ctx.costTracker.recordComputeCost("autonomous_loop", 0.005);
      }

      // Log sustainability status
      const net = ctx.costTracker.getNetBalance();
      const sustainable = ctx.costTracker.isSelfSustaining();
      console.log(
        `[savings-agent] Sustainability: ${sustainable ? "YES" : "NO"} ` +
          `(net: $${net.toFixed(4)})`
      );
    } catch (err) {
      console.error("[savings-agent] Autonomous loop error:", err);
    }
  }, intervalMs);

  return () => {
    console.log("[savings-agent] Autonomous loop stopped");
    clearInterval(interval);
  };
}
