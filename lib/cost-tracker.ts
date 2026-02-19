import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { CostEntry, RevenueEntry } from "./types.js";

const DATA_DIR = join(homedir(), ".savings-agent");

export class CostTracker {
  private costs: CostEntry[] = [];
  private revenue: RevenueEntry[] = [];
  private costsPath: string;
  private revenuePath: string;

  constructor() {
    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
    }
    this.costsPath = join(DATA_DIR, "costs.json");
    this.revenuePath = join(DATA_DIR, "revenue.json");
    this.load();
  }

  recordComputeCost(action: string, estimatedCostUsd: number): void {
    this.costs.push({
      timestamp: Date.now(),
      type: "compute",
      action,
      estimatedCostUsd,
    });
    this.saveCosts();
  }

  recordGasCost(
    action: string,
    gasCostUsd: number,
    txHash?: string
  ): void {
    this.costs.push({
      timestamp: Date.now(),
      type: "gas",
      action,
      estimatedCostUsd: gasCostUsd,
      txHash,
    });
    this.saveCosts();
  }

  recordRevenue(
    source: "management_fee" | "x402",
    amountUsdc: number,
    txHash?: string
  ): void {
    this.revenue.push({
      timestamp: Date.now(),
      source,
      amountUsdc,
      txHash,
    });
    this.saveRevenue();
  }

  getTotalComputeCost(): number {
    return this.costs
      .filter((c) => c.type === "compute")
      .reduce((sum, c) => sum + c.estimatedCostUsd, 0);
  }

  getTotalGasCost(): number {
    return this.costs
      .filter((c) => c.type === "gas")
      .reduce((sum, c) => sum + c.estimatedCostUsd, 0);
  }

  getTotalCost(): number {
    return this.costs.reduce((sum, c) => sum + c.estimatedCostUsd, 0);
  }

  getTotalRevenue(): number {
    return this.revenue.reduce((sum, r) => sum + r.amountUsdc, 0);
  }

  getNetBalance(): number {
    return this.getTotalRevenue() - this.getTotalCost();
  }

  isSelfSustaining(): boolean {
    return this.getTotalRevenue() >= this.getTotalCost();
  }

  getRecentCosts(limit: number = 50): CostEntry[] {
    return this.costs.slice(-limit);
  }

  getRecentRevenue(limit: number = 50): RevenueEntry[] {
    return this.revenue.slice(-limit);
  }

  private saveCosts(): void {
    writeFileSync(this.costsPath, JSON.stringify(this.costs, null, 2));
  }

  private saveRevenue(): void {
    writeFileSync(this.revenuePath, JSON.stringify(this.revenue, null, 2));
  }

  private load(): void {
    try {
      if (existsSync(this.costsPath)) {
        this.costs = JSON.parse(readFileSync(this.costsPath, "utf-8"));
      }
    } catch {
      this.costs = [];
    }
    try {
      if (existsSync(this.revenuePath)) {
        this.revenue = JSON.parse(readFileSync(this.revenuePath, "utf-8"));
      }
    } catch {
      this.revenue = [];
    }
  }
}
