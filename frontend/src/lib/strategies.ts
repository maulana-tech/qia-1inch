/**
 * Empat strategi yang bisa dipilih saat membuka posisi.
 *
 * Sebuah "strategi" di sini bukan label di kartu — ia program bytecode yang
 * berbeda, dan perbedaannya benar-benar mengubah harga yang dikutip posisimu.
 *
 * # Urutan instruksi bukan selera
 *
 * Dua aturan mengikat, keduanya ditemukan lewat pengukuran, bukan bacaan:
 *
 *   1. `flatFeeIn` harus SESUDAH `xycConcentrate`. `AquaAccounting.t.sol` milik
 *      SwapVM menandai urutan sebaliknya sebagai salah dan mengujinya sebagai
 *      pembanding.
 *   2. `solvencyGuard` harus SEBELUM instruksi apa pun yang membentuk saldo
 *      (`decay`, `xycConcentrate`). Ia membandingkan jaminan nyata di dompet
 *      dengan `ctx.swap.balanceOut`; sesudah `xycConcentrate` angka itu saldo
 *      VIRTUAL yang sudah digelembungkan, jadi maker yang terjamin penuh pun
 *      terbaca kekurangan jaminan dan kena surcharge palsu yang menghapus
 *      seluruh keuntungan konsentrasi. Tidak ada yang gagal saat itu terjadi.
 *
 * Keduanya dikunci di `contracts/test/Strategies.t.sol` dan vektor golden di
 * `protocol/swapvm/test/golden.test.ts`.
 *
 * # Tidak ada yield dari luar
 *
 * Keempatnya berpenghasilan dari satu sumber yang sama: fee swap yang lewat
 * posisimu. Tidak ada lending, staking, atau farming di balik ini. Kalau tidak
 * ada yang menukar, keempatnya menghasilkan nol. Karena itu antarmukanya tidak
 * pernah menampilkan APY — kita tidak punya sumbernya.
 */
import {
  aquaProtocolFee,
  withoutSalt,
  decay,
  exclusiveFill,
  flatFeeIn,
  priceBand,
  program,
  salt,
  solvencyGuard,
  xycConcentrate,
  xycSwap,
  buildOrder,
  type Hex,
} from '@iqia/swapvm'

import { MOCK_USDC_ADDRESS, MOCK_WETH_ADDRESS, PROTOCOL_FEE_BPS, TREASURY_ADDRESS } from './config'

/**
 * Pasangan yang dilayani meja ini.
 *
 * Desimalnya ditulis di sini karena `lib/tokens.ts` menyimpan angka yang salah
 * (angka warisan aplikasi asal), dan salah satu desimal berarti nominal sepuluh
 * kali lipat. Yang benar-benar aman tetap `tokenDecimals()` yang membaca dari
 * kontrak; ini untuk tampilan dan pembagian saldo.
 */
export const DESK_PAIR = [
  { symbol: 'WETH', address: MOCK_WETH_ADDRESS, decimals: 18 },
  { symbol: 'USDC', address: MOCK_USDC_ADDRESS, decimals: 6 },
] as const

export type StrategyId = 'santai' | 'terkonsentrasi' | 'anti-arbitrase' | 'meja-privat'

export interface StrategyParams {
  salt: bigint
  /** Fee yang kamu pungut dari tiap swap, basis-point 1e9. */
  feeBps: bigint
  /** Batas surcharge saat jaminan menipis, basis-point 1e9. Nol mematikannya. */
  surchargeBps: bigint
  /** Terkonsentrasi: lebar pita satu sisi, basis-point 1e4 (1000 = ±10%). */
  bandBps?: number
  /** Terkonsentrasi: harga acuan dalam unit mentah, titik-tetap 1e18. */
  spotE18?: bigint
  /** Anti-arbitrase: periode peluruhan dalam detik. */
  decayPeriod?: number
  /** Meja privat: satu-satunya alamat yang boleh mengisi. */
  exclusiveTaker?: string
}

export interface StrategyMeta {
  id: StrategyId
  name: string
  /** Satu kalimat: apa yang dilakukannya. */
  summary: string
  /** Untuk siapa strategi ini masuk akal. */
  bestFor: string
  /** Apa yang kamu tanggung. Selalu ada, tidak pernah kosong. */
  tradeoff: string
  /** Instruksi yang menyusunnya, untuk ditampilkan apa adanya. */
  opcodes: string[]
}

export const STRATEGIES: StrategyMeta[] = [
  {
    id: 'santai',
    name: 'Santai',
    summary: 'Melayani di seluruh rentang harga, memungut fee kecil dari tiap swap.',
    bestFor: 'Kamu ingin saldomu bekerja tanpa perlu ditengok.',
    tradeoff: 'Penghasilan per modal paling kecil dari keempatnya.',
    opcodes: ['solvencyGuard', 'flatFeeIn', 'xycSwap'],
  },
  {
    id: 'terkonsentrasi',
    name: 'Terkonsentrasi',
    summary: 'Memusatkan likuiditas di satu pita harga, jadi modal yang sama memungut jauh lebih banyak.',
    bestFor: 'Kamu punya pandangan soal rentang harga dan bersedia menengoknya.',
    tradeoff:
      'Di luar pita posisimu berhenti menghasilkan dan berakhir seluruhnya di satu sisi aset, dan pitanya perlu dikirim ulang kalau sudah basi. Pita sempit juga tidak otomatis lebih menghasilkan kalau saldomu timpang.',
    opcodes: ['solvencyGuard', 'xycConcentrate', 'flatFeeIn', 'xycSwap'],
  },
  {
    id: 'anti-arbitrase',
    name: 'Anti-arbitrase',
    summary: 'Sesudah harga bergerak, kuotasimu menyusul bertahap, bukan seketika.',
    bestFor: 'Kamu sering kehilangan selisih harga ke arbitraser saat pasar bergerak cepat.',
    tradeoff: 'Penukar biasa sesekali mendapat harga sedikit lebih buruk, jadi volume bisa turun.',
    opcodes: ['solvencyGuard', 'decay', 'flatFeeIn', 'xycSwap'],
  },
  {
    id: 'meja-privat',
    name: 'Meja privat',
    summary: 'Hanya satu alamat yang kamu sebut boleh mengisi posisimu.',
    bestFor: 'Kamu punya penyalur atau solver tetap dan ingin memberi mereka harga lebih tipis.',
    tradeoff: 'Selain alamat itu, tidak ada yang bisa mengisi — kalau mereka diam, posisimu diam.',
    opcodes: ['exclusiveFill', 'solvencyGuard', 'flatFeeIn', 'xycSwap'],
  },
]

export function strategyMeta(id: StrategyId): StrategyMeta {
  const found = STRATEGIES.find((s) => s.id === id)
  if (!found) throw new Error(`Strategi tidak dikenal: ${id}`)
  return found
}

/**
 * Harga tersirat dari saldo posisi, dalam unit MENTAH.
 *
 * Sengaja mentah, tanpa penyesuaian desimal: `xycConcentrate` membandingkan
 * saldo apa adanya seperti yang dilihat VM, jadi pitanya harus dinyatakan dalam
 * satuan yang sama. P = tokenGt/tokenLt, ditentukan urutan alamat.
 */
export function impliedSpotE18(
  tokenA: string,
  amountA: bigint,
  tokenB: string,
  amountB: bigint,
): bigint {
  const aIsLt = tokenA.toLowerCase() < tokenB.toLowerCase()
  const lt = aIsLt ? amountA : amountB
  const gt = aIsLt ? amountB : amountA
  if (lt === 0n) throw new Error('saldo sisi bawah nol, harga tersiratnya tidak terdefinisi')
  return (gt * 10n ** 18n) / lt
}

/** Merakit program untuk satu strategi. Urutannya dijamin di sini. */
export function strategyProgram(id: StrategyId, p: StrategyParams): Hex {
  const head: Hex[] = []

  if (id === 'meja-privat') {
    if (!p.exclusiveTaker) throw new Error('Meja privat butuh alamat penyalur.')
    head.push(exclusiveFill(p.exclusiveTaker))
  }

  // Selalu sebelum decay/concentrate. Lihat catatan di kepala berkas.
  if (p.surchargeBps > 0n) head.push(solvencyGuard(p.surchargeBps))

  if (id === 'anti-arbitrase') {
    if (!p.decayPeriod) throw new Error('Anti-arbitrase butuh periode peluruhan.')
    head.push(decay(p.decayPeriod))
  }

  if (id === 'terkonsentrasi') {
    if (!p.bandBps || p.spotE18 === undefined) {
      throw new Error('Terkonsentrasi butuh lebar pita dan harga acuan.')
    }
    const band = priceBand(p.spotE18, p.bandBps)
    head.push(xycConcentrate(band.min, band.max))
  }

  // Fee protokol mendahului fee maker. Keduanya memotong dari MASUKAN sebelum
  // kurva, jadi yang berkurang keluaran penukar — bukan bagian maker. Diukur di
  // contracts/test/ProtocolFee.t.sol.
  if (PROTOCOL_FEE_BPS > 0n) head.push(aquaProtocolFee(PROTOCOL_FEE_BPS, TREASURY_ADDRESS))

  if (p.feeBps > 0n) head.push(flatFeeIn(p.feeBps))

  return program(...head, xycSwap(), salt(p.salt))
}

export function strategyOrder(maker: string, id: StrategyId, p: StrategyParams) {
  const o = buildOrder({ maker, program: strategyProgram(id, p) })
  return { maker: o.maker, traits: BigInt(o.traits), data: o.data, encoded: o } as const
}



/**
 * Apakah posisi ini dibuka lewat halaman Savings.
 *
 * Dikenali dari BENTUK programnya, bukan dari urutan kemunculannya. Sebelumnya
 * halaman Savings mengambil posisi aktif pertama apa pun jenisnya — jadi posisi
 * Terkonsentrasi yang dibuka lewat wizard akan tampil sebagai "tabunganmu", dan
 * tombol Tutup akan menutup posisi itu. Tombol destruktif yang mengenai sasaran
 * yang salah.
 */
export function isSavingsProgram(program: Hex, params: Omit<StrategyParams, 'salt'>): boolean {
  const expected = withoutSalt(strategyProgram('santai', { ...params, salt: 0n }))
  return withoutSalt(program).toLowerCase() === expected.toLowerCase()
}
