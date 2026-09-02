import http from 'node:http';
import { Framework } from '../base/types.js';
import { OP_TYPE_IQIA, OP_COMMAND_PLACE_ORDER } from './config.js';
import { hexToBytes, bytesToHex } from '../base/encoding.js';
import { MatchingEngine, assembleMatchInputs } from '@iqia/matcher';
import type { SubmittedOrder } from '@iqia/matcher';
import { encodeAbiParameters, parseAbiParameters } from 'viem';

let signPort = '9090';

export function setSignPort(port: string): void {
  signPort = port;
}

// Global Matching Engine state (Memory-resident in the TEE)
const engine = new MatchingEngine();

export function register(framework: Framework): void {
  framework.handle(OP_TYPE_IQIA, OP_COMMAND_PLACE_ORDER, handlePlaceOrder);
}

async function handlePlaceOrder(msg: string): Promise<[string | null, number, string | null]> {
  if (!msg) return [null, 0, 'originalMessage is empty'];

  let ciphertext: Uint8Array;
  try {
    ciphertext = hexToBytes(msg);
  } catch (e) {
    return [null, 0, `invalid hex: ${e}`];
  }

  // 1. Decrypt ECIES payload via the TEE node
  let plaintext: Uint8Array;
  try {
    plaintext = await decryptViaNode(ciphertext);
  } catch (e) {
    return [null, 0, `decryption failed: ${e}`];
  }

  // 2. Parse JSON order
  let order: SubmittedOrder;
  try {
    const jsonStr = Buffer.from(plaintext).toString('utf-8');
    order = JSON.parse(jsonStr, (key, value) => {
        // Hydrate BigInts (amounts & prices)
        if (key === 'price' || key === 'amount') return BigInt(value);
        return value;
    });
  } catch (e) {
    return [null, 0, `invalid order JSON: ${e}`];
  }

  // 3. Submit to Engine
  try {
    engine.submit(order);
  } catch(e) {
    return [null, 0, `engine validation failed: ${e}`];
  }

  // 4. Find matches
  const matches = engine.findMatches();
  if (matches.length === 0) {
    // No match yet, order is in the book. Return success but no result data to settle.
    return [null, 1, null];
  }

  // 5. ABI encode the first match result for IqiaPool.settle
  const match = matches[0];
  
  // Format the commitments to strictly match the bytes32 ABI structure
  const orderA = padCommitment(match.a.commitment);
  const orderB = padCommitment(match.b.commitment);
  
  const { publicInputs } = assembleMatchInputs(match);
  
  // Public inputs from assembleMatchInputs:
  // 0: order_commitment_a
  // 1: order_commitment_b
  // 2: fill_note_buyer
  // 3: fill_note_seller
  // 4: residual_order_a
  // 5: residual_order_b
  // 6: refund_note_a
  // 7: refund_note_b

  const leafCommitments: `0x${string}`[] = [];
  const leafMemos: `0x${string}`[] = [];
  const residualCommitments: `0x${string}`[] = [];
  const residualMemos: `0x${string}`[] = [];

  // Add non-zero leaf commitments
  for (const idx of [2, 3, 6, 7]) {
    const cmt = publicInputs[idx].toString();
    if (cmt !== '0' && cmt !== '0n') {
      leafCommitments.push(padCommitment(cmt) as `0x${string}`);
      leafMemos.push('0x'); // Empty memo for hackathon MVP
    }
  }

  // Add non-zero residual commitments
  for (const idx of [4, 5]) {
    const cmt = publicInputs[idx].toString();
    if (cmt !== '0' && cmt !== '0n') {
      residualCommitments.push(padCommitment(cmt) as `0x${string}`);
      residualMemos.push('0x'); // Empty memo for hackathon MVP
    }
  }

  let encoded: Uint8Array;
  try {
    const abi = parseAbiParameters('bytes32 orderA, bytes32 orderB, bytes32[] leafCommitments, bytes[] leafMemos, bytes32[] residualCommitments, bytes[] residualMemos');
    const hex = encodeAbiParameters(abi, [
      orderA as `0x${string}`,
      orderB as `0x${string}`,
      leafCommitments,
      leafMemos,
      residualCommitments,
      residualMemos
    ]);
    encoded = hexToBytes(hex.slice(2));
  } catch (e) {
    return [null, 0, `ABI encoding failed: ${e}`];
  }

  return [bytesToHex(encoded), 1, null];
}

function padCommitment(cmt: string): string {
    const hex = cmt.startsWith('0x') ? cmt.slice(2) : cmt;
    return `0x${hex.padEnd(64, '0').slice(0, 64)}`;
}

/**
 * Call the TEE node's /decrypt endpoint.
 */
function decryptViaNode(ciphertext: Uint8Array): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const url = `http://localhost:${signPort}/decrypt`;
    const body = JSON.stringify({
      encryptedMessage: Buffer.from(ciphertext).toString('base64'),
    });
    const req = http.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const data = Buffer.concat(chunks).toString('utf-8');
          if (res.statusCode !== 200) return reject(new Error(`node returned ${res.statusCode}: ${data}`));
          try {
            const parsed = JSON.parse(data);
            resolve(new Uint8Array(Buffer.from(parsed.decryptedMessage, 'base64')));
          } catch (e) {
            reject(new Error(`decode response: ${e}`));
          }
        });
      },
    );
    req.on('error', (e) => reject(new Error(`request error: ${e.message}`)));
    req.write(body);
    req.end();
  });
}
export function reportState(): any { return {}; }
