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

/**
 * Fee protokol: potongan dari masukan yang langsung dikirim ke `to`.
 *
 * Dipotong sebelum kurva, sama seperti `flatFeeIn`, jadi yang berkurang adalah
 * keluaran untuk penukar — bukan bagian maker. Ditulis di dalam program posisi,
 * sehingga siapa pun bisa membongkar bytecode-nya dan melihat berapa yang
 * diambil dan ke mana.
 *
 * @param feeBps basis-point 1e9
 * @param to penerima. Alamat nol ditolak kontraknya, jadi ditolak di sini juga.
 */
export function aquaProtocolFee(feeBps: bigint, to: string): Hex {
  if (feeBps > BPS) throw new Error(`feeBps tidak boleh melebihi ${BPS}`)
  if (/^0x0{40}$/i.test(to)) throw new Error('penerima fee protokol tidak boleh alamat nol')
  return instruction(
    OPCODE.AQUA_PROTOCOL_FEE_IN,
    concatHex([toBytes(feeBps, 4), toAddressBytes(to)]),
  )
}

/** Kurva hasil-kali tetap, x*y=k. */
export function xycSwap(): Hex {
  return instruction(OPCODE.XYC_SWAP)
}

/**
 * Likuiditas terkonsentrasi pada satu pita harga.
 *
 * Ia BUKAN instruksi swap — ia menggelembungkan saldo virtual, lalu `xycSwap`
 * yang mengayun kurvanya. Jadi `xycSwap` tetap wajib ada sesudahnya.
 *
 * @param sqrtPriceMin akar P_min, titik-tetap 1e18, dengan P = tokenGt/tokenLt
 * @param sqrtPriceMax akar P_max, titik-tetap 1e18
 */
export function xycConcentrate(sqrtPriceMin: bigint, sqrtPriceMax: bigint): Hex {
  if (sqrtPriceMin >= sqrtPriceMax) throw new Error('sqrtPriceMin harus di bawah sqrtPriceMax')
  if (sqrtPriceMin <= 0n) throw new Error('sqrtPriceMin harus di atas nol')
  return concatHex([
    instruction(OPCODE.XYC_CONCENTRATE, concatHex([toBytes(sqrtPriceMin, 32), toBytes(sqrtPriceMax, 32)])),
  ])
}

/**
 * Penyesuaian saldo virtual berdasar waktu sejak transaksi terakhir.
 *
 * Gaya Mooniswap: sesudah harga bergerak, kuotasi menyusul bertahap sepanjang
 * `period`, jadi arbitrase tidak bisa menyapu selisihnya dalam satu transaksi.
 *
 * @param period detik, muat di uint16 (maksimum 65535, sekitar 18 jam)
 */
export function decay(period: number): Hex {
  if (!Number.isInteger(period) || period <= 0 || period > 65535) {
    throw new Error(`period harus bilangan bulat 1..65535, diterima ${period}`)
  }
  return instruction(OPCODE.DECAY, toBytes(period, 2))
}

/** Akar bilangan bulat, metode Newton. */
function isqrt(n: bigint): bigint {
  if (n < 0n) throw new Error('akar dari bilangan negatif')
  if (n < 2n) return n
  let x = n
  let y = (x + 1n) / 2n
  while (y < x) {
    x = y
    y = (x + n / x) / 2n
  }
  return x
}

/**
 * Ubah harga jadi akar-harga titik-tetap 1e18, seperti `Math.sqrt(P * 1e36)`
 * di Solidity.
 *
 * @param priceE18 harga dalam titik-tetap 1e18
 */
export function sqrtPriceX18(priceE18: bigint): bigint {
  return isqrt(priceE18 * 10n ** 18n)
}

/**
 * Pita harga di sekitar satu titik, dinyatakan sebagai lebar relatif.
 *
 * @param spotE18 harga acuan, titik-tetap 1e18
 * @param widthBps lebar satu sisi dalam basis-point 1e4 (1000 = ±10%)
 */
export function priceBand(spotE18: bigint, widthBps: number): { min: bigint; max: bigint } {
  if (widthBps <= 0 || widthBps >= 10_000) throw new Error('widthBps harus di antara 1 dan 9999')
  const w = BigInt(widthBps)
  return {
    min: sqrtPriceX18((spotE18 * (10_000n - w)) / 10_000n),
    max: sqrtPriceX18((spotE18 * (10_000n + w)) / 10_000n),
  }
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

/**
 * Program tanpa instruksi `salt` di ekornya.
 *
 * Salt itu pembeda, bukan perilaku — dua posisi dengan program sama dan salt
 * berbeda berperilaku identik. Untuk mengenali JENIS sebuah posisi, salt-nya
 * harus dibuang dulu.
 *
 * Instruksi salt selalu 10 byte di ekor: opcode 0x14, panjang 0x08, lalu 8 byte
 * nilainya. Program yang tidak berakhir dengan salt dikembalikan apa adanya.
 */
export function withoutSalt(program: Hex): Hex {
  const body = program.slice(2)
  const start = body.length - 20
  if (start < 0 || body.slice(start, start + 4).toLowerCase() !== '1408') return program
  return `0x${body.slice(0, start)}` as Hex
}
