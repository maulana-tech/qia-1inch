/**
 * Nomor opcode untuk router SwapVM milik Iqia.
 *
 * Nomor opcode adalah INDEKS di array yang dikembalikan `_opcodes()`. Tidak ada
 * cara membacanya dari luar rantai, jadi angkanya ditanam di sini.
 *
 * Yang menjaga angka-angka ini tetap benar adalah
 * `contracts/test/OpcodeNumbers.t.sol`. Test itu memanggil `findOpcode` di
 * Solidity dan menegaskan hasilnya sama dengan daftar ini. Kalau versi SwapVM
 * berikutnya menggeser susunannya, test tersebut gagal sebelum ada program
 * salah yang terlanjur dipakai.
 */
export const OPCODE = {
  JUMP: 10,
  DEADLINE: 13,
  XYC_SWAP: 17,
  XYC_CONCENTRATE: 18,
  DECAY: 19,
  SALT: 20,
  FLAT_FEE_IN: 21,
  /** Custom Iqia — hanya alamat yang ditunjuk boleh mengisi order. */
  EXCLUSIVE_FILL: 22,
  /** Custom Iqia — harga menyesuaikan sandaran nyata maker. */
  SOLVENCY_GUARD: 23,
} as const

/** Basis basis-point SwapVM. Perhatikan: 1e9, bukan 10_000. */
export const BPS = 1_000_000_000n
