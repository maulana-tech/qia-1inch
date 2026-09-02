/** Utilitas hex minimal. Sengaja tanpa dependensi: paket ini hanya menyusun byte. */

export type Hex = `0x${string}`

export function concatHex(parts: Hex[]): Hex {
  return `0x${parts.map((p) => p.slice(2)).join('')}` as Hex
}

/** Bilangan tak bertanda, big-endian, dengan lebar byte tetap. */
export function toBytes(value: bigint | number, byteLength: number): Hex {
  const v = BigInt(value)
  if (v < 0n) throw new Error(`toBytes: nilai negatif ${v}`)
  const max = 1n << BigInt(byteLength * 8)
  if (v >= max) throw new Error(`toBytes: ${v} tidak muat dalam ${byteLength} byte`)
  return `0x${v.toString(16).padStart(byteLength * 2, '0')}` as Hex
}

/** Alamat 20 byte, huruf kecil, tanpa checksum. */
export function toAddressBytes(address: string): Hex {
  const clean = address.trim().toLowerCase()
  if (!/^0x[0-9a-f]{40}$/.test(clean)) throw new Error(`Alamat tidak valid: ${address}`)
  return clean as Hex
}

export function byteLength(hex: Hex): number {
  return (hex.length - 2) / 2
}
