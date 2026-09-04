import { describe, expect, it } from 'vitest'
import { buildOrder, buildTakerData } from '../src/traits.js'
import { exclusiveFill, flatFeeIn, program, salt, solvencyGuard, xycSwap } from '../src/program.js'

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
