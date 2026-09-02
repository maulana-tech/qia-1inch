/**
 * @iqia/sdk — TypeScript client for the Iqia privacy platform (EVM).
 */
import { TREE_DEPTH, ZEROS } from "./constants.js";
import { MerkleTree } from "./merkle.js";
import { createNote, createOutputNote, deriveKeys, noteNullifier } from "./note.js";
import { createOrder, orderLockedAmount } from "./order.js";
import { fieldToHex, randomField, toField, type Field } from "./poseidon.js";
import {
  NoirProver,
  buildCancelOrderInputs,
  buildPlaceOrderInputs,
  buildTransferInputs,
  buildWithdrawInputs,
  type CircuitInputMap,
  type TransferInputNote,
} from "./prover.js";
import { IqiaContract, encodePublicInputs, recipientHash, type CircuitName, assetIdFromAddress } from "./evm.js";
import type { Asset, BalanceNote, KeyPair, Order, OrderParams, ProofData } from "./types.js";
import { Wallet } from "./wallet.js";

// ---- Re-exports -----------------------------------------------------------
export * from "./constants.js";
export * from "./poseidon.js";
export * from "./types.js";
export * from "./merkle.js";
export * from "./note.js";
export * from "./order.js";
export * from "./match.js";
export * from "./note-crypto.js";
export * from "./wallet.js";
export * from "./prover.js";
export * from "./evm.js";

// ---- Public SDK surface ---------------------------------------------------

export interface EvmOperation {
  to: `0x${string}`;
  data: `0x${string}`;
  value?: bigint;
}

export interface DepositResult {
  note: BalanceNote;
  operation: EvmOperation;
  commitment: Field;
}

export interface ProvenResult {
  operation: EvmOperation;
  proof: ProofData;
  nullifiers: Field[];
  outputNotes: BalanceNote[];
}

export interface IqiaSdk {
  deposit(params: { asset: Asset; amount: bigint; from: string }): DepositResult;
  withdraw(params: { note: BalanceNote; recipient: string }): Promise<ProvenResult>;
  placeOrder(params: { note: BalanceNote; order: OrderParams }): Promise<ProvenResult & { order: Order }>;
  getShieldedBalances(): Map<Field, bigint>;
  getOpenOrders(): Order[];
}

export interface IqiaConfig {
  contractAddress: string;
  spendingKey?: Field;
  provers?: Partial<Record<CircuitName, NoirProver>>;
  tree?: MerkleTree;
  wallet?: Wallet;
}

export class Iqia implements IqiaSdk {
  readonly keys: KeyPair;
  readonly wallet: Wallet;
  readonly tree: MerkleTree;
  readonly contract: IqiaContract;
  private readonly provers: Partial<Record<CircuitName, NoirProver>>;

  constructor(config: IqiaConfig) {
    this.keys = deriveKeys(config.spendingKey ?? randomField());
    this.wallet = config.wallet ?? new Wallet();
    this.tree = config.tree ?? new MerkleTree(TREE_DEPTH);
    this.contract = new IqiaContract(config.contractAddress);
    this.provers = config.provers ?? {};
  }

  get ownerKey(): Field {
    return this.keys.ownerKey;
  }

  observeCommitment(commitment: Field): number {
    const index = this.tree.insert(commitment);
    const owned = this.wallet.getNotes().find((n) => n.commitment === commitment && n.leafIndex === undefined);
    if (owned) owned.leafIndex = index;
    return index;
  }

  deposit(params: { asset: Asset; amount: bigint; from: string }): DepositResult {
    if (!params.asset.address) {
      throw new Error("deposit requires asset.address");
    }
    const note = createNote({
      assetId: params.asset.assetId,
      amount: params.amount,
      spendingKey: this.keys.spendingKey,
    });
    note.assetAddress = params.asset.address;
    const isNative = params.asset.address === "native" || params.asset.address === "ETH";
    const data = this.contract.depositData({
      asset: params.asset.address,
      amount: params.amount,
      commitment: note.commitment,
    });
    const operation: EvmOperation = {
      to: this.contract.address,
      data,
      value: isNative ? params.amount : 0n,
    };
    this.wallet.addNote(note);
    return { note, operation, commitment: note.commitment };
  }

  async withdraw(params: { note: BalanceNote; recipient: string }): Promise<ProvenResult> {
    const { note } = params;
    const merkle = this.merkleProofFor(note);
    const nullifier = noteNullifier(note);
    const rHash = recipientHash(params.recipient);
    const inputs = buildWithdrawInputs({
      merkleRoot: merkle.root,
      nullifier,
      recipientHash: rHash,
      amount: note.amount,
      assetId: note.assetId,
      noteOwnerKey: note.ownerKey,
      noteBlinding: note.blinding,
      spendingKey: note.spendingKey,
      merklePath: merkle.pathElements,
      merkleIndices: merkle.pathIndices,
    });
    const proof = await this.prove("withdraw", inputs);
    const data = this.contract.withdrawData({
      proof: proof.proof,
      publicInputs: proof.publicInputs,
      recipient: params.recipient,
      amount: note.amount,
      asset: this.assetAddressOrThrow(note),
    });
    this.wallet.markNoteSpent(note);
    return { operation: { to: this.contract.address, data }, proof, nullifiers: [nullifier], outputNotes: [] };
  }

  async placeOrder(params: { note: BalanceNote; order: OrderParams }): Promise<ProvenResult & { order: Order }> {
    const { note } = params;
    const order = createOrder({ ...params.order, spendingKey: note.spendingKey });
    const locked = orderLockedAmount(order);
    if (note.assetId !== locked.assetId) throw new Error("note asset does not match order's locked asset");
    if (note.amount < locked.amount) throw new Error("note balance insufficient to lock order");
    const changeAmount = note.amount - locked.amount;

    const merkle = this.merkleProofFor(note);
    const nullifier = noteNullifier(note);
    const changeNote =
      changeAmount > 0n
        ? createNote({ assetId: note.assetId, amount: changeAmount, spendingKey: note.spendingKey })
        : undefined;
    const changeCommitment = changeNote?.commitment ?? 0n;

    const inputs = buildPlaceOrderInputs({
      merkleRoot: merkle.root,
      nullifier,
      orderCommitment: order.commitment,
      changeCommitment,
      lockedAssetId: locked.assetId,
      noteAmount: note.amount,
      noteAssetId: note.assetId,
      noteBlinding: note.blinding,
      spendingKey: note.spendingKey,
      merklePath: merkle.pathElements,
      merkleIndices: merkle.pathIndices,
      orderSide: order.side,
      orderPrice: order.price,
      orderAmount: order.amount,
      orderAssetBase: order.assetBase,
      orderAssetQuote: order.assetQuote,
      orderNonce: order.nonce,
      changeAmount,
      changeBlinding: changeNote?.blinding ?? 0n,
    });
    const proof = await this.prove("place_order", inputs);
    const data = this.contract.placeOrderData({
      proof: proof.proof,
      publicInputs: proof.publicInputs,
      encryptedMemos: new Uint8Array(),
    });
    this.wallet.markNoteSpent(note);
    this.wallet.addOrder(order);
    const outputNotes = changeNote ? [changeNote] : [];
    if (changeNote) this.wallet.addNote(changeNote);
    return { operation: { to: this.contract.address, data }, proof, nullifiers: [nullifier], outputNotes, order };
  }

  getShieldedBalances(): Map<Field, bigint> {
    return this.wallet.getShieldedBalances();
  }

  getOpenOrders(): Order[] {
    return this.wallet.getOpenOrders();
  }

  private merkleProofFor(note: BalanceNote) {
    if (note.leafIndex === undefined) {
      throw new Error(`note ${fieldToHex(note.commitment)} has no leafIndex; call observeCommitment`);
    }
    return this.tree.generateProof(note.leafIndex);
  }

  private async prove(circuit: CircuitName, inputs: CircuitInputMap): Promise<ProofData> {
    const prover = this.provers[circuit];
    if (!prover) {
      throw new Error(`no prover configured for circuit "${circuit}".`);
    }
    return prover.prove(inputs);
  }

  private assetAddressOrThrow(note: BalanceNote): string {
    if (!note.assetAddress) {
      throw new Error("withdraw requires note.assetAddress (the SAC/ERC20 address)");
    }
    return note.assetAddress;
  }
}

export default Iqia;
