import {
  type Address,
  encodeFunctionData,
  pad,
  hexToBytes,
  bytesToHex,
  keccak256,
} from 'viem';

import { FIELD_BYTES, NATIVE_ASSET_ID, PROOF_BYTES } from './constants.js';
import { bytesToField, fieldToBytes, hash2, toField, type Field } from './poseidon.js';
import type { ProofData } from './types.js';

// We import the generated ABIs. Note: you need to ensure they are available in the build.
import IqiaPoolAbiJson from './abi/IqiaPool.json' with { type: "json" };
import IqiaInstructionSenderAbiJson from './abi/IqiaInstructionSender.json' with { type: "json" };

export const iqiaPoolAbi = IqiaPoolAbiJson;
export const iqiaInstructionSenderAbi = IqiaInstructionSenderAbiJson;

/** Public-input field order per circuit. SHARED sec 7 (authoritative). */
export const PUBLIC_INPUT_ORDER = {
  withdraw: ["merkle_root", "nullifier", "recipient_hash", "amount", "asset_id"],
  transfer: [
    "merkle_root",
    "nullifier_0",
    "nullifier_1",
    "out_commitment_0",
    "out_commitment_1",
    "ext_data_hash",
  ],
  place_order: ["merkle_root", "nullifier", "order_commitment", "change_commitment", "locked_asset_id"],
  match_orders: [
    "order_commitment_a",
    "order_commitment_b",
    "fill_note_buyer",
    "fill_note_seller",
    "residual_order_a",
    "residual_order_b",
    "refund_note_a",
    "refund_note_b",
  ],
  cancel_order: ["order_commitment", "refund_commitment", "refund_asset_id"],
} as const;

export type CircuitName = keyof typeof PUBLIC_INPUT_ORDER;

/**
 * Convert an EVM address (20 bytes) to a 32-byte Field element.
 * EVM convention is left-padded with zeros.
 */
export function addressToField(address: string): Field {
  const padded = pad(address as Address, { size: 32 });
  return toField(bytesToField(hexToBytes(padded)));
}

/** asset_id for an ERC20 token, or 0 for native ETH/XLM. */
export function assetIdFromAddress(address?: string | null): Field {
  if (!address || address === "native" || address === "ETH" || address === "XLM") return NATIVE_ASSET_ID;
  return hash2(addressToField(address), 0);
}

/** recipient_hash = hash2(recipient_address_as_field, 0). */
export function recipientHash(address: string): Field {
  return hash2(addressToField(address), 0);
}

export function encodePublicInputs(fields: readonly Field[]): Uint8Array {
  const out = new Uint8Array(fields.length * FIELD_BYTES);
  fields.forEach((f, i) => out.set(fieldToBytes(f), i * FIELD_BYTES));
  return out;
}

export function decodePublicInputs(bytes: Uint8Array): Field[] {
  if (bytes.length % FIELD_BYTES !== 0) {
    throw new Error(`public_inputs length ${bytes.length} is not a multiple of ${FIELD_BYTES}`);
  }
  const out: Field[] = [];
  for (let i = 0; i < bytes.length; i += FIELD_BYTES) {
    out.push(bytesToField(bytes.subarray(i, i + FIELD_BYTES)));
  }
  return out;
}

/**
 * Builds EVM transactions/calldata for the deployed IqiaPool contract via viem.
 */
export class IqiaContract {
  readonly address: Address;

  constructor(address: string) {
    this.address = address as Address;
  }

  /** deposit(bytes32 commitment, address asset, uint256 amount) */
  depositData(args: { asset: string; amount: bigint; commitment: Field }): `0x${string}` {
    const isNative = args.asset === "native" || args.asset === "ETH" || args.asset === "XLM";
    const assetAddr = isNative ? '0x0000000000000000000000000000000000000000' : args.asset;
    
    return encodeFunctionData({
      abi: iqiaPoolAbi,
      functionName: 'deposit',
      args: [bytesToHex(fieldToBytes(args.commitment)), assetAddr, args.amount],
    });
  }

  /** withdraw(bytes proof, bytes32[] publicInputs, address recipient, uint256 amount, address asset) */
  withdrawData(args: {
    proof: Uint8Array;
    publicInputs: Field[];
    recipient: string;
    amount: bigint;
    asset: string;
  }): `0x${string}` {
    this.assertProofLen(args.proof);
    const pubInputs = args.publicInputs.map((f) => bytesToHex(fieldToBytes(f)));
    const isNative = args.asset === "native" || args.asset === "ETH" || args.asset === "XLM";
    const assetAddr = isNative ? '0x0000000000000000000000000000000000000000' : args.asset;

    return encodeFunctionData({
      abi: iqiaPoolAbi,
      functionName: 'withdraw',
      args: [
        bytesToHex(args.proof),
        pubInputs,
        args.recipient as Address,
        args.amount,
        assetAddr as Address,
      ],
    });
  }
  
  // For other functions like placeOrder, we will likely call InstructionSender on EVM.
  placeOrderData(args: {
    proof: Uint8Array;
    publicInputs: Field[];
    encryptedMemos: Uint8Array;
  }): `0x${string}` {
    this.assertProofLen(args.proof);
    const pubInputs = args.publicInputs.map((f) => bytesToHex(fieldToBytes(f)));
    return encodeFunctionData({
      abi: iqiaInstructionSenderAbi,
      functionName: 'placeOrder',
      args: [
        bytesToHex(args.proof),
        pubInputs,
        bytesToHex(args.encryptedMemos),
      ],
    });
  }

  private assertProofLen(proof: Uint8Array): void {
    if (proof.length !== 0 && proof.length !== PROOF_BYTES) {
      throw new Error(`proof must be ${PROOF_BYTES} bytes (got ${proof.length})`);
    }
  }
}
