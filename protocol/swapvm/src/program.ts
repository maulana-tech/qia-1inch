import { OPCODE, BPS } from './opcodes.js'
import { concatHex, toAddressBytes, toBytes, byteLength, type Hex } from './hex.js'

/**
 * Perakit program SwapVM.
 *
 * Format instruksi: `[opcode 1 byte][panjang argumen 1 byte][argumen]`.
 * Panjang argumen dibatasi satu byte, jadi maksimum 255 byte per instruksi.
 */

function instruction(opcode: number, args: Hex = '0x'): Hex {
  const len = byteLength(args)
  if (len > 255) throw new Error(`Argumen instruksi terlalu panjang: ${len} byte, maksimum 255`)
  return concatHex([toBytes(opcode, 1), toBytes(len, 1), args])
}

/** Hanya `taker` yang boleh mengeksekusi order ini. */
export function exclusiveFill(taker: string): Hex {
  return instruction(OPCODE.EXCLUSIVE_FILL, toAddressBytes(taker))
}

/**
 * Harga menyesuaikan sandaran nyata maker.
 * @param maxSurchargeBps Biaya tambahan saat sandaran nol. Harus di bawah BPS.
 */
export function solvencyGuard(maxSurchargeBps: bigint): Hex {
  if (maxSurchargeBps >= BPS) throw new Error(`maxSurchargeBps harus di bawah ${BPS}`)
  return instruction(OPCODE.SOLVENCY_GUARD, toBytes(maxSurchargeBps, 4))
}

/** Fee tetap yang dipungut dari sisi masukan. */
export function flatFeeIn(feeBps: bigint): Hex {
  if (feeBps > BPS) throw new Error(`feeBps tidak boleh melebihi ${BPS}`)
  return instruction(OPCODE.FLAT_FEE_IN, toBytes(feeBps, 4))
}

/** Kurva hasil-kali tetap, x*y=k. */
export function xycSwap(): Hex {
  return instruction(OPCODE.XYC_SWAP)
}

/** Pembeda agar strategyHash unik. Tidak mempengaruhi perhitungan. */
export function salt(value: bigint): Hex {
  return instruction(OPCODE.SALT, toBytes(value, 8))
}

/** Batas waktu, detik Unix. */
export function deadline(timestamp: number): Hex {
  return instruction(OPCODE.DEADLINE, toBytes(timestamp, 5))
}

/** Menyambung beberapa instruksi menjadi satu program. Urutan menentukan arti. */
export function program(...instructions: Hex[]): Hex {
  return concatHex(instructions)
}
