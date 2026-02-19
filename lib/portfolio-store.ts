import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomBytes } from "node:crypto";
import type { SavingsPlan, TransactionRecord } from "./types.js";

const DATA_DIR = join(homedir(), ".savings-agent");

export class PortfolioStore {
  private plans: SavingsPlan[] = [];
  private transactions: TransactionRecord[] = [];
  private plansPath: string;
  private txPath: string;

  constructor() {
    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
    }
    this.plansPath = join(DATA_DIR, "plans.json");
    this.txPath = join(DATA_DIR, "transactions.json");
    this.load();
  }

  // ----- Plans -----

  createPlan(
    params: Omit<SavingsPlan, "planId" | "createdAt" | "status" | "transactions">
  ): SavingsPlan {
    const plan: SavingsPlan = {
      ...params,
      planId: `plan_${randomBytes(6).toString("hex")}`,
      status: "created",
      createdAt: Date.now(),
      transactions: [],
    };
    this.plans.push(plan);
    this.savePlans();
    return plan;
  }

  getPlan(planId: string): SavingsPlan | undefined {
    return this.plans.find((p) => p.planId === planId);
  }

  getAllPlans(): SavingsPlan[] {
    return [...this.plans];
  }

  getActivePlans(): SavingsPlan[] {
    return this.plans.filter(
      (p) => p.status === "active" || p.status === "created"
    );
  }

  updatePlan(planId: string, updates: Partial<SavingsPlan>): void {
    const idx = this.plans.findIndex((p) => p.planId === planId);
    if (idx === -1) return;
    this.plans[idx] = { ...this.plans[idx], ...updates };
    this.savePlans();
  }

  addTransactionToPlan(planId: string, txHash: string): void {
    const plan = this.getPlan(planId);
    if (plan) {
      plan.transactions.push(txHash);
      this.savePlans();
    }
  }

  // ----- Transactions -----

  recordTransaction(tx: TransactionRecord): void {
    this.transactions.push(tx);
    this.saveTx();
  }

  getRecentTransactions(limit: number = 50): TransactionRecord[] {
    return this.transactions.slice(-limit);
  }

  getTransactionsForPlan(planId: string): TransactionRecord[] {
    return this.transactions.filter((tx) => tx.planId === planId);
  }

  // ----- Persistence -----

  private savePlans(): void {
    writeFileSync(this.plansPath, JSON.stringify(this.plans, null, 2));
  }

  private saveTx(): void {
    writeFileSync(this.txPath, JSON.stringify(this.transactions, null, 2));
  }

  private load(): void {
    try {
      if (existsSync(this.plansPath)) {
        this.plans = JSON.parse(readFileSync(this.plansPath, "utf-8"));
      }
    } catch {
      this.plans = [];
    }
    try {
      if (existsSync(this.txPath)) {
        this.transactions = JSON.parse(readFileSync(this.txPath, "utf-8"));
      }
    } catch {
      this.transactions = [];
    }
  }
}
