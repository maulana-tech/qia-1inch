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

import {
  MOCK_DAI_ADDRESS,
  MOCK_USDC_ADDRESS,
  MOCK_WBTC_ADDRESS,
  MOCK_WETH_ADDRESS,
  PROTOCOL_FEE_BPS,
  TREASURY_ADDRESS,
} from './config'

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

/**
 * Pasangan yang bisa dibuka penabung, semuanya beralas WETH.
 *
 * # Kenapa selalu ada WETH di satu sisi
 *
 * Bukan keterbatasan Aqua — Aqua menerima pasangan apa pun. Ini keputusan
 * produk, dan konsekuensi langsung dari sifat yang membuat aplikasi ini ada:
 * `ship()` tidak memindahkan token dan tidak memeriksa saldo, jadi tumpukan
 * WETH yang SAMA bisa mengutip di ketiga pasar sekaligus. Terukur di rantai:
 * 19,93 WETH menopang tiga pasar, efisiensi modal 3,00×.
 *
 * Kalau tiap pasar memakai alas berbeda, angka itu tidak pernah lahir — modalnya
 * terbagi, persis seperti di kolam biasa.
 *
 * # Kenapa hanya yang alamatnya terisi
 *
 * Token yang belum di-deploy disaring keluar, bukan ditampilkan sebagai pilihan
 * yang gagal saat ditekan. Sebelum `add-markets.sh` dijalankan, hanya USDC yang
 * ada — dan menawarkan DAI di situ berarti menjanjikan pasar yang tidak bisa
 * dibuka.
 */
export const SAVINGS_PAIRS = [
  { symbol: 'USDC', address: MOCK_USDC_ADDRESS, decimals: 6 },
  { symbol: 'DAI', address: MOCK_DAI_ADDRESS, decimals: 18 },
  { symbol: 'WBTC', address: MOCK_WBTC_ADDRESS, decimals: 6 },
].filter((t) => /^0x[0-9a-f]{40}$/i.test(t.address))

/** Alas semua pasangan tabungan. */
export const SAVINGS_BASE = { symbol: 'WETH', address: MOCK_WETH_ADDRESS, decimals: 18 } as const

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
    name: 'Relaxed',
    summary: 'Quotes across the whole price range, taking a small fee from every swap.',
    bestFor: 'You want your balance working without needing to watch it.',
    tradeoff: 'The lowest earnings per unit of capital of the four.',
    opcodes: ['solvencyGuard', 'flatFeeIn', 'xycSwap'],
  },
  {
    id: 'terkonsentrasi',
    name: 'Concentrated',
    summary: 'Concentrates liquidity into one price band, so the same capital earns far more.',
    bestFor: 'You have a view on the price range and are willing to check on it.',
    tradeoff:
      'Outside the band your position stops earning and ends up entirely on one side of the pair, and a stale band has to be re-shipped. A narrow band is also not automatically better when your two balances are lopsided.',
    opcodes: ['solvencyGuard', 'xycConcentrate', 'flatFeeIn', 'xycSwap'],
  },
  {
    id: 'anti-arbitrase',
    name: 'Anti-arbitrage',
    summary: 'After the price moves, your quote catches up gradually rather than instantly.',
    bestFor: 'You keep losing the spread to arbitrageurs when the market moves fast.',
    tradeoff: 'Ordinary swappers occasionally get a slightly worse price, so volume can drop.',
    opcodes: ['solvencyGuard', 'decay', 'flatFeeIn', 'xycSwap'],
  },
  {
    id: 'meja-privat',
    name: 'Private desk',
    summary: 'Only the one address you name may fill your position.',
    bestFor: 'You have a regular flow provider or solver and want to quote them tighter.',
    tradeoff: 'Nobody else can fill it — if they go quiet, your position goes quiet.',
    opcodes: ['exclusiveFill', 'solvencyGuard', 'flatFeeIn', 'xycSwap'],
  },
]

export function strategyMeta(id: StrategyId): StrategyMeta {
  const found = STRATEGIES.find((s) => s.id === id)
  if (!found) throw new Error(`Unknown strategy: ${id}`)
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
  if (lt === 0n) throw new Error('the lower-side balance is zero, so the implied price is undefined')
  return (gt * 10n ** 18n) / lt
}

/** Merakit program untuk satu strategi. Urutannya dijamin di sini. */
export function strategyProgram(id: StrategyId, p: StrategyParams): Hex {
  const head: Hex[] = []

  if (id === 'meja-privat') {
    if (!p.exclusiveTaker) throw new Error('A private desk needs the flow provider address.')
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
      throw new Error('Concentrated needs a band width and a reference price.')
    }
    const band = priceBand(p.spotE18, p.bandBps)
    head.push(xycConcentrate(band.min, band.max))
  }

  // Fee protokol mendahului fee maker. Keduanya memotong dari MASUKAN sebelum
  // kurva, jadi yang berkurang keluaran penukar — bukan bagian maker. Diukur di
  // contracts/test/ProtocolFee.t.sol.
  //
  // BATASNYA, dan ini bukan detail kecil: pemungutannya BEST-EFFORT. Fee ditarik
  // dari saldo Aqua maker untuk tokenIn yang SUDAH ADA sebelum swap, bukan dari
  // uang penukar yang baru masuk. Kalau makernya tidak sanggup, tarikan gagal
  // ditangkap, `ProtocolFeeSkipped` dipancarkan, dan swap-nya lanjut tanpa fee.
  //
  // Akibat praktisnya: posisi satu sisi — pengguna menyetor WETH saja, tanpa
  // USDC — tidak menghasilkan apa pun untuk treasury pada arah USDC→WETH, justru
  // arah yang paling sering dipakai. Jadi pendapatan HARUS diukur dari event
  // `Pulled` ke treasury, tidak boleh dihitung dari volume × tarif.
  // Dipatok di test_FeeDilewatiKalauMakerTidakSanggup.
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
