import { describe, it, expect, beforeEach } from "vitest";
import { stringAsciiCV, uintCV, tupleCV, listCV, principalCV, boolCV, optionalCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_AMOUNT = 101;
const ERR_INVALID_MILESTONE = 102;
const ERR_INVALID_STATUS = 103;
const ERR_ESCROW_NOT_FOUND = 104;
const ERR_ALREADY_FUNDED = 105;
const ERR_NOT_FUNDED = 106;
const ERR_MILESTONE_NOT_DUE = 107;
const ERR_DISPUTE_ACTIVE = 109;
const ERR_NO_DISPUTE = 110;
const ERR_INVALID_TOKEN = 111;

interface Milestone {
  amount: number;
  status: string;
  dueBlock: number;
}

interface Escrow {
  client: string;
  artist: string;
  amount: number;
  tokenType: string;
  milestones: Milestone[];
  status: string;
  commissionId: number;
  disputeActive: boolean;
}

interface EscrowBalance {
  balance: number;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class EscrowMock {
  state: {
    escrowCounter: number;
    platformFee: number;
    authorityContract: string | null;
    escrows: Map<number, Escrow>;
    escrowBalances: Map<number, EscrowBalance>;
  } = {
    escrowCounter: 1,
    platformFee: 100,
    authorityContract: null,
    escrows: new Map(),
    escrowBalances: new Map(),
  };
  blockHeight: number = 100;
  caller: string = "ST1CLIENT";
  stxTransfers: Array<{ amount: number; from: string; to: string }> = [];
  sip10Transfers: Array<{ amount: number; from: string; to: string }> = [];

  reset() {
    this.state = {
      escrowCounter: 1,
      platformFee: 100,
      authorityContract: null,
      escrows: new Map(),
      escrowBalances: new Map(),
    };
    this.blockHeight = 100;
    this.caller = "ST1CLIENT";
    this.stxTransfers = [];
    this.sip10Transfers = [];
  }

  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (contractPrincipal === "SP000000000000000000002Q6VF78" || this.state.authorityContract) {
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    }
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setPlatformFee(newFee: number): Result<boolean> {
    if (!this.state.authorityContract || newFee < 0) {
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    }
    this.state.platformFee = newFee;
    return { ok: true, value: true };
  }

  createEscrow(
    client: string,
    artist: string,
    amount: number,
    tokenType: string,
    milestones: Milestone[],
    commissionId: number
  ): Result<number> {
    if (!this.state.authorityContract || client === artist || amount <= 0) {
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    }
    if (!["STX", "SIP10"].includes(tokenType)) {
      return { ok: false, value: ERR_INVALID_TOKEN };
    }
    const totalMilestoneAmount = milestones.reduce((sum, m) => sum + m.amount, 0);
    if (amount !== totalMilestoneAmount || milestones.some(m => m.amount <= 0 || m.dueBlock < this.blockHeight)) {
      return { ok: false, value: ERR_INVALID_MILESTONE };
    }
    const id = this.state.escrowCounter;
    this.state.escrows.set(id, { client, artist, amount, tokenType, milestones, status: "pending", commissionId, disputeActive: false });
    this.state.escrowBalances.set(id, { balance: 0 });
    this.state.escrowCounter++;
    return { ok: true, value: id };
  }

  fundEscrow(escrowId: number): Result<boolean> {
    const escrow = this.state.escrows.get(escrowId);
    if (!escrow || !this.state.authorityContract || escrow.client !== this.caller || escrow.status !== "pending" || escrow.disputeActive) {
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    }
    const transferAmount = escrow.amount + this.state.platformFee;
    if (escrow.tokenType === "STX") {
      this.stxTransfers.push({ amount: transferAmount, from: this.caller, to: this.state.authorityContract });
    } else {
      this.sip10Transfers.push({ amount: transferAmount, from: this.caller, to: this.state.authorityContract });
    }
    this.state.escrows.set(escrowId, { ...escrow, status: "funded" });
    this.state.escrowBalances.set(escrowId, { balance: escrow.amount });
    return { ok: true, value: true };
  }

  releaseMilestone(escrowId: number, milestoneIndex: number): Result<boolean> {
    const escrow = this.state.escrows.get(escrowId);
    if (!escrow || escrow.client !== this.caller || escrow.status !== "funded" || escrow.disputeActive) {
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    }
    const milestone = escrow.milestones[milestoneIndex];
    if (!milestone || milestone.status !== "pending" || this.blockHeight < milestone.dueBlock) {
      return { ok: false, value: ERR_INVALID_MILESTONE };
    }
    const balance = this.state.escrowBalances.get(escrowId)?.balance || 0;
    if (balance < milestone.amount) {
      return { ok: false, value: ERR_NOT_FUNDED };
    }
    if (escrow.tokenType === "STX") {
      this.stxTransfers.push({ amount: milestone.amount, from: this.caller, to: escrow.artist });
    } else {
      this.sip10Transfers.push({ amount: milestone.amount, from: this.caller, to: escrow.artist });
    }
    escrow.milestones[milestoneIndex] = { ...milestone, status: "completed" };
    this.state.escrows.set(escrowId, { ...escrow });
    this.state.escrowBalances.set(escrowId, { balance: balance - milestone.amount });
    return { ok: true, value: true };
  }

  initiateDispute(escrowId: number): Result<boolean> {
    const escrow = this.state.escrows.get(escrowId);
    if (!escrow || (escrow.client !== this.caller && escrow.artist !== this.caller) || escrow.status !== "funded" || escrow.disputeActive) {
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    }
    this.state.escrows.set(escrowId, { ...escrow, disputeActive: true });
    return { ok: true, value: true };
  }

  resolveDispute(escrowId: number, refundToClient: boolean): Result<boolean> {
    const escrow = this.state.escrows.get(escrowId);
    if (!escrow || this.caller !== this.state.authorityContract || !escrow.disputeActive) {
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    }
    const balance = this.state.escrowBalances.get(escrowId)?.balance || 0;
    if (balance <= 0) {
      return { ok: false, value: ERR_NOT_FUNDED };
    }
    const recipient = refundToClient ? escrow.client : escrow.artist;
    if (escrow.tokenType === "STX") {
      this.stxTransfers.push({ amount: balance, from: this.caller, to: recipient });
    } else {
      this.sip10Transfers.push({ amount: balance, from: this.caller, to: recipient });
    }
    this.state.escrows.set(escrowId, { ...escrow, status: "completed", disputeActive: false });
    this.state.escrowBalances.set(escrowId, { balance: 0 });
    return { ok: true, value: true };
  }
}

describe("EscrowMock", () => {
  let contract: EscrowMock;

  beforeEach(() => {
    contract = new EscrowMock();
    contract.reset();
  });

  it("creates escrow successfully", () => {
    contract.setAuthorityContract("ST2AUTH");
    const milestones: Milestone[] = [{ amount: 500, status: "pending", dueBlock: 150 }];
    const result = contract.createEscrow("ST1CLIENT", "ST2ARTIST", 500, "STX", milestones, 1);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(1);
    const escrow = contract.state.escrows.get(1);
    expect(escrow?.client).toBe("ST1CLIENT");
    expect(escrow?.amount).toBe(500);
    expect(escrow?.milestones[0].amount).toBe(500);
  });

  it("funds escrow successfully", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.createEscrow("ST1CLIENT", "ST2ARTIST", 500, "STX", [{ amount: 500, status: "pending", dueBlock: 150 }], 1);
    const result = contract.fundEscrow(1);
    expect(result.ok).toBe(true);
    expect(contract.stxTransfers).toEqual([{ amount: 600, from: "ST1CLIENT", to: "ST2AUTH" }]);
    expect(contract.state.escrows.get(1)?.status).toBe("funded");
    expect(contract.state.escrowBalances.get(1)?.balance).toBe(500);
  });

  it("releases milestone successfully", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.createEscrow("ST1CLIENT", "ST2ARTIST", 500, "STX", [{ amount: 500, status: "pending", dueBlock: 100 }], 1);
    contract.fundEscrow(1);
    contract.blockHeight = 150;
    const result = contract.releaseMilestone(1, 0);
    expect(result.ok).toBe(true);
    expect(contract.stxTransfers[1]).toEqual({ amount: 500, from: "ST1CLIENT", to: "ST2ARTIST" });
    expect(contract.state.escrows.get(1)?.milestones[0].status).toBe("completed");
    expect(contract.state.escrowBalances.get(1)?.balance).toBe(0);
  });

  it("initiates dispute successfully", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.createEscrow("ST1CLIENT", "ST2ARTIST", 500, "STX", [{ amount: 500, status: "pending", dueBlock: 150 }], 1);
    contract.fundEscrow(1);
    const result = contract.initiateDispute(1);
    expect(result.ok).toBe(true);
    expect(contract.state.escrows.get(1)?.disputeActive).toBe(true);
  });

  it("rejects invalid token type", () => {
    contract.setAuthorityContract("ST2AUTH");
    const result = contract.createEscrow("ST1CLIENT", "ST2ARTIST", 500, "INVALID", [{ amount: 500, status: "pending", dueBlock: 150 }], 1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_TOKEN);
  });

  it("rejects unauthorized funding", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.createEscrow("ST1CLIENT", "ST2ARTIST", 500, "STX", [{ amount: 500, status: "pending", dueBlock: 150 }], 1);
    contract.caller = "ST3FAKE";
    const result = contract.fundEscrow(1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("rejects dispute resolution without authority", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.createEscrow("ST1CLIENT", "ST2ARTIST", 500, "STX", [{ amount: 500, status: "pending", dueBlock: 150 }], 1);
    contract.fundEscrow(1);
    contract.initiateDispute(1);
    contract.caller = "ST3FAKE";
    const result = contract.resolveDispute(1, true);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });
});