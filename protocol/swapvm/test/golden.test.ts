import { describe, expect, it } from 'vitest'
import { buildOrder, buildTakerData } from '../src/traits.js'
import { disassemble } from '../src/disasm.js'
import {
  aquaProtocolFee,
  decay,
  exclusiveFill,
  flatFeeIn,
  priceBand,
  program,
  salt,
  solvencyGuard,
  sqrtPriceX18,
  xycConcentrate,
  xycSwap,
  withoutSalt,
} from '../src/program.js'

/**
 * Vektor golden dihasilkan Solidity oleh
 * `contracts/test/GoldenVectors.t.sol`. Regenerasi dengan:
 *
 *   cd contracts && forge test --match-test test_PrintGoldenVectors -vv
 *
 * Kalau angka di bawah berubah tanpa perubahan sengaja pada encoder, berarti
 * SwapVM mengubah pengemasannya — jangan sesuaikan angkanya begitu saja,
 * telusuri dulu apa yang berubah.
 */
const MAKER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const TAKER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'

const GOLDEN_PROGRAM =
  '0x1614f39fd6e51aad88f6f4ce6ab8827279cfffb92266170402faf0801504002dc6c011001408000000000000002a'
const GOLDEN_ORDER_TRAITS =
  '0x4000000000000000000000000000000000000000000000000000000000000000'
/** Bentuk program tabungan (frontend/src/lib/savings.ts). */
const GOLDEN_SAVINGS_PROGRAM =
  '0x170402faf0801504002dc6c011001408000000000000002a'

/**
 * Empat strategi onboarding.
 *
 * Yang dikunci di sini bukan cuma byte-nya, tapi URUTANNYA. `solvencyGuard`
 * wajib mendahului `decay` dan `xycConcentrate`: ia membandingkan jaminan nyata
 * dengan `ctx.swap.balanceOut`, dan sesudah concentrate angka itu saldo virtual
 * yang sudah digelembungkan, sehingga maker yang terjamin penuh pun kena
 * surcharge palsu yang menghapus seluruh keuntungan konsentrasi — tanpa ada
 * yang gagal. Diukur dan dikunci di contracts/test/Strategies.t.sol.
 */
const GOLDEN_STRATEGIES = {
  santai: '0x170402faf0801504002dc6c011001408000000000000002a',
  terkonsentrasi:
    '0x170402faf080124000000000000000000000000000000000000000000000000009d025defee4df4400000000000000000000000000000000000000000000000013a04bbdfdc9be881504002dc6c011001408000000000000002a',
  antiArbitrase: '0x170402faf0801302012c1504002dc6c011001408000000000000002a',
  denganFeeProtokol:
    '0x170402faf0801c180007a120f39fd6e51aad88f6f4ce6ab8827279cfffb922661504002dc6c011001408000000000000002a',
  mejaPrivat:
    '0x1614f39fd6e51aad88f6f4ce6ab8827279cfffb92266170402faf0801504002dc6c011001408000000000000002a',
} as const

const GOLDEN_TAKER_DATA =
  '0x002000200020002000200020002000200020002000050000000000000000000000000000000000000000000000000de0b6b3a7640000'

describe('perakit program', () => {
  it('menghasilkan byte yang identik dengan Solidity', () => {
    const built = program(
      exclusiveFill(TAKER),
      solvencyGuard(50_000_000n), // 0.05e9
      flatFeeIn(3_000_000n), // 0.003e9
      xycSwap(),
      salt(0x2an),
    )
    expect(built).toBe(GOLDEN_PROGRAM)
  })

  it('menyusun program tabungan dengan fee sebelum kurva', () => {
    // Ini bukan sekadar cek encoding — urutannya yang dikunci. Versi pertama
    // fitur Savings tidak memungut fee sama sekali, dan tidak ada yang gagal
    // karenanya: posisinya tetap melayani swap, cuma pemiliknya tidak dapat
    // apa-apa. Perilakunya diuji di contracts/test/SavingsProgram.t.sol.
    const built = program(
      solvencyGuard(50_000_000n),
      flatFeeIn(3_000_000n),
      xycSwap(),
      salt(0x2an),
    )
    expect(built).toBe(GOLDEN_SAVINGS_PROGRAM)
  })

  it('menyusun keempat strategi onboarding identik dengan Solidity', () => {
    const guard = solvencyGuard(50_000_000n)
    const fee = flatFeeIn(3_000_000n)
    const tail = [xycSwap(), salt(0x2an)] as const

    expect(program(guard, fee, ...tail)).toBe(GOLDEN_STRATEGIES.santai)
    expect(
      program(guard, xycConcentrate(sqrtPriceX18(5n * 10n ** 17n), sqrtPriceX18(2n * 10n ** 18n)), fee, ...tail),
    ).toBe(GOLDEN_STRATEGIES.terkonsentrasi)
    expect(program(guard, decay(300), fee, ...tail)).toBe(GOLDEN_STRATEGIES.antiArbitrase)
    expect(program(exclusiveFill(TAKER), guard, fee, ...tail)).toBe(GOLDEN_STRATEGIES.mejaPrivat)
  })

  it('menyisipkan fee protokol sebelum fee maker', () => {
    // Urutannya penting dan bukan selera: keduanya memotong dari MASUKAN
    // sebelum kurva, jadi yang berkurang keluaran penukar — bukan bagian maker.
    // Dibuktikan di contracts/test/ProtocolFee.t.sol.
    expect(
      program(
        solvencyGuard(50_000_000n),
        aquaProtocolFee(500_000n, TAKER),
        flatFeeIn(3_000_000n),
        xycSwap(),
        salt(0x2an),
      ),
    ).toBe(GOLDEN_STRATEGIES.denganFeeProtokol)
  })

  it('menolak penerima fee protokol yang kosong', () => {
    expect(() => aquaProtocolFee(500_000n, '0x' + '0'.repeat(40))).toThrow(/alamat nol/)
  })

  it('menolak pita dan periode yang tidak masuk akal', () => {
    expect(() => xycConcentrate(2n, 1n)).toThrow(/di bawah/)
    expect(() => decay(0)).toThrow(/1\.\.65535/)
    expect(() => decay(70_000)).toThrow(/1\.\.65535/)
    expect(() => priceBand(10n ** 18n, 0)).toThrow(/1 dan 9999/)
  })

  it('membentuk pita simetris di sekitar harga acuan', () => {
    const spot = 10n ** 18n
    const { min, max } = priceBand(spot, 1000) // ±10%
    expect(min).toBe(sqrtPriceX18((spot * 9000n) / 10_000n))
    expect(max).toBe(sqrtPriceX18((spot * 11_000n) / 10_000n))
    expect(min).toBeLessThan(sqrtPriceX18(spot))
    expect(max).toBeGreaterThan(sqrtPriceX18(spot))
  })

  it('mengkodekan opcode, panjang, lalu argumen', () => {
    // 0x11 = 17 = XYC_SWAP, tanpa argumen
    expect(xycSwap()).toBe('0x1100')
    // 0x16 = 22 = EXCLUSIVE_FILL, 20 byte alamat
    expect(exclusiveFill(TAKER)).toBe('0x1614f39fd6e51aad88f6f4ce6ab8827279cfffb92266')
  })

  it('menolak argumen di luar rentang', () => {
    expect(() => solvencyGuard(1_000_000_000n)).toThrow(/di bawah/)
    expect(() => flatFeeIn(1_000_000_001n)).toThrow(/melebihi/)
    expect(() => exclusiveFill('bukan-alamat')).toThrow(/tidak valid/)
  })
})

describe('MakerTraits', () => {
  it('menghasilkan traits dan data yang identik dengan Solidity', () => {
    const order = buildOrder({ maker: MAKER, program: GOLDEN_PROGRAM })
    expect(order.traits).toBe(GOLDEN_ORDER_TRAITS)
    expect(order.data).toBe(GOLDEN_PROGRAM)
    expect(order.maker).toBe(MAKER.toLowerCase())
  })

  it('menyalakan bit Aqua secara bawaan', () => {
    const withAqua = buildOrder({ maker: MAKER, program: '0x1100' })
    const withoutAqua = buildOrder({ maker: MAKER, program: '0x1100', useAquaInsteadOfSignature: false })
    expect(BigInt(withAqua.traits) & (1n << 254n)).toBe(1n << 254n)
    expect(BigInt(withoutAqua.traits) & (1n << 254n)).toBe(0n)
  })

  it('menempatkan receiver di 160 bit bawah', () => {
    const order = buildOrder({ maker: MAKER, program: '0x1100', receiver: TAKER })
    expect(BigInt(order.traits) & ((1n << 160n) - 1n)).toBe(BigInt(TAKER.toLowerCase()))
  })
})

describe('TakerTraits', () => {
  it('menghasilkan byte yang identik dengan Solidity', () => {
    const data = buildTakerData({
      taker: TAKER,
      isExactIn: true,
      threshold: 10n ** 18n,
      hasPreTransferInCallback: true,
    })
    expect(data).toBe(GOLDEN_TAKER_DATA)
  })

  it('mengemas flag sesuai bit yang benar', () => {
    const exactOut = buildTakerData({ taker: TAKER, isExactIn: false })
    // 20 byte indeks, lalu 2 byte flag
    expect(exactOut.slice(2 + 40, 2 + 44)).toBe('0000')

    const exactIn = buildTakerData({ taker: TAKER, isExactIn: true })
    expect(exactIn.slice(2 + 40, 2 + 44)).toBe('0001')

    const withCallback = buildTakerData({ taker: TAKER, isExactIn: true, hasPreTransferInCallback: true })
    expect(withCallback.slice(2 + 40, 2 + 44)).toBe('0005')
  })

  it('menghilangkan slice yang tidak dipakai, dan indeksnya tetap kumulatif', () => {
    // Tanpa threshold, seluruh indeks nol dan tidak ada tail.
    const bare = buildTakerData({ taker: TAKER, isExactIn: true })
    expect(bare).toBe(`0x${'0'.repeat(40)}0001`)
  })

  it('menghilangkan `to` kalau sama dengan taker', () => {
    const sameAsTaker = buildTakerData({ taker: TAKER, isExactIn: true, to: TAKER })
    const omitted = buildTakerData({ taker: TAKER, isExactIn: true })
    expect(sameAsTaker).toBe(omitted)
  })
})

describe('pengkodean order', () => {
  it('menghasilkan strategyHash yang sama dengan rantai', async () => {
    const { keccak256 } = await import('viem')
    const { encodeOrder } = await import('../src/traits.js')

    // Nilai ini diambil dari rantai sungguhan: order dengan program
    // solvencyGuard(0.05e9) + xycSwap + salt(2) dari maker di bawah menghasilkan
    // strategyHash ini, dan Aqua memang mencatat saldo 10 WETH untuknya.
    const order = buildOrder({
      maker: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      program: program(solvencyGuard(50_000_000n), xycSwap(), salt(2n)),
    })

    expect(keccak256(encodeOrder(order))).toBe(
      '0xab8fe078986f0e6012469a83d4cd15e4a91e77db47c5e9b9e4b16de35604ed1d',
    )
  })
})

describe('mengenali jenis posisi', () => {
  it('membuang salt di ekor, menyisakan sisanya utuh', () => {
    const body = program(solvencyGuard(50_000_000n), xycSwap())
    expect(withoutSalt(program(solvencyGuard(50_000_000n), xycSwap(), salt(2n)))).toBe(body)

    // Dua posisi yang sama dengan salt berbeda harus dikenali sebagai satu jenis.
    expect(withoutSalt(program(solvencyGuard(50_000_000n), xycSwap(), salt(99n)))).toBe(body)
  })

  it('membiarkan program tanpa salt apa adanya', () => {
    const p = program(solvencyGuard(50_000_000n), xycSwap())
    expect(withoutSalt(p)).toBe(p)
  })

  it('tidak keliru memotong instruksi lain yang berukuran sama', () => {
    // flatFeeIn berakhir 6 byte, bukan 10 — tapi ekor mana pun yang kebetulan
    // berpola `1408` akan salah dipotong. Yang menjaga: pola itu harus berada
    // tepat 10 byte dari ujung.
    const p = program(flatFeeIn(2_500_000n), xycSwap())
    expect(withoutSalt(p)).toBe(p)
  })
})

describe('membongkar program', () => {
  it('membalik program() persis', () => {
    const p = program(solvencyGuard(50_000_000n), flatFeeIn(2_500_000n), xycSwap(), salt(7n))
    const ins = disassemble(p)

    expect(ins.map((i) => i.name)).toEqual(['SOLVENCY_GUARD', 'FLAT_FEE_IN', 'XYC_SWAP', 'SALT'])
    expect(ins.map((i) => i.offset)).toEqual([0, 6, 12, 14])
    expect(ins[3].args).toBe('0x0000000000000007')
  })

  it('menamai opcode yang tidak dikenal sebagai null, bukan menebak', () => {
    // 0xfe bukan milik siapa pun di tabel kita. Program tim lain akan memuat
    // opcode yang tidak kita kenal, dan menebak namanya lebih buruk daripada
    // mengaku tidak tahu.
    const [ins] = disassemble('0xfe020102')
    expect(ins.opcode).toBe(0xfe)
    expect(ins.name).toBeNull()
    expect(ins.args).toBe('0x0102')
  })

  it('menolak program yang terpotong alih-alih mengembalikan separuh', () => {
    // opcode 0x11, mengaku punya 4 byte argumen, tapi cuma ada 2.
    expect(() => disassemble('0x11040102')).toThrow(/ran out of bytes/)
  })
})

