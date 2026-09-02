import { concatHex, toAddressBytes, toBytes, byteLength, type Hex } from './hex.js'

/**
 * Pengkode MakerTraits dan TakerTraits.
 *
 * Keduanya bit-packing yang harus sama persis dengan Solidity — satu bit meleset
 * berarti order ditolak atau, lebih buruk, dieksekusi dengan arti yang berbeda.
 * `protocol/swapvm/test/golden.test.ts` membandingkan keluaran di sini dengan
 * byte yang dihasilkan Solidity untuk masukan yang sama.
 *
 * Cakupan: hanya order tanpa hook dan tanpa callback maker. Itu yang dipakai
 * Iqia. Menambahkan hook menuntut penulisan slice indeks yang saat ini selalu
 * nol — lihat MakerTraitsLib.build di SwapVM.
 */

const MAKER_USE_AQUA_INSTEAD_OF_SIGNATURE = 1n << 254n
const MAKER_SHOULD_UNWRAP_WETH = 1n << 255n
const MAKER_ALLOW_ZERO_AMOUNT_IN = 1n << 253n

export interface Order {
  maker: Hex
  /** MakerTraits terkemas, 32 byte. */
  traits: Hex
  /** Tail order. Tanpa hook, isinya persis program-nya. */
  data: Hex
}

export interface BuildOrderArgs {
  maker: string
  program: Hex
  /** address(0) berarti maker sendiri yang menerima. */
  receiver?: string
  useAquaInsteadOfSignature?: boolean
  shouldUnwrapWeth?: boolean
  allowZeroAmountIn?: boolean
}

export function buildOrder(args: BuildOrderArgs): Order {
  const receiver = args.receiver ? toAddressBytes(args.receiver) : '0x0000000000000000000000000000000000000000'

  let traits = BigInt(receiver)
  if (args.useAquaInsteadOfSignature ?? true) traits |= MAKER_USE_AQUA_INSTEAD_OF_SIGNATURE
  if (args.shouldUnwrapWeth) traits |= MAKER_SHOULD_UNWRAP_WETH
  if (args.allowZeroAmountIn) traits |= MAKER_ALLOW_ZERO_AMOUNT_IN

  // Tanpa hook, keempat slice indeks bernilai nol, jadi tidak ada yang ditulis
  // di bit 160 ke atas selain flag.
  return {
    maker: toAddressBytes(args.maker),
    traits: toBytes(traits, 32),
    data: args.program,
  }
}

const TAKER_IS_EXACT_IN = 0x0001
const TAKER_SHOULD_UNWRAP_WETH = 0x0002
const TAKER_HAS_PRE_TRANSFER_IN_CALLBACK = 0x0004
const TAKER_HAS_PRE_TRANSFER_OUT_CALLBACK = 0x0008
const TAKER_IS_STRICT_THRESHOLD = 0x0010
const TAKER_IS_FIRST_TRANSFER_FROM_TAKER = 0x0020
const TAKER_USE_TRANSFER_FROM_AND_AQUA_PUSH = 0x0040

export interface BuildTakerDataArgs {
  taker: string
  isExactIn: boolean
  shouldUnwrapWeth?: boolean
  /** Ambang slippage, 32 byte. Dihilangkan berarti tanpa ambang. */
  threshold?: bigint
  /** Penerima selain taker. */
  to?: string
  /** Detik Unix. Nol berarti tanpa batas waktu. */
  deadline?: number
  hasPreTransferInCallback?: boolean
  hasPreTransferOutCallback?: boolean
  isStrictThresholdAmount?: boolean
  isFirstTransferFromTaker?: boolean
  useTransferFromAndAquaPush?: boolean
  /** Data yang dikonsumsi instruksi saat eksekusi. */
  instructionsArgs?: Hex
}

export function buildTakerData(args: BuildTakerDataArgs): Hex {
  const threshold: Hex = args.threshold === undefined ? '0x' : toBytes(args.threshold, 32)

  const to = args.to ? toAddressBytes(args.to) : undefined
  const includeTo = to !== undefined
    && BigInt(to) !== 0n
    && to.toLowerCase() !== toAddressBytes(args.taker).toLowerCase()
  const toBytesHex: Hex = includeTo ? (to as Hex) : '0x'

  const includeDeadline = (args.deadline ?? 0) !== 0
  const deadlineHex: Hex = includeDeadline ? toBytes(args.deadline as number, 5) : '0x'

  const instructionsArgs: Hex = args.instructionsArgs ?? '0x'

  // Sepuluh indeks kumulatif. Setiap slice yang tidak dipakai membuat indeks
  // berikutnya sama dengan sebelumnya, bukan nol.
  const i0 = byteLength(threshold)
  const i1 = i0 + byteLength(toBytesHex)
  const i2 = i1 + byteLength(deadlineHex)
  const i3 = i2 // preTransferInHookData
  const i4 = i3 // postTransferInHookData
  const i5 = i4 // preTransferOutHookData
  const i6 = i5 // postTransferOutHookData
  const i7 = i6 // preTransferInCallbackData
  const i8 = i7 // preTransferOutCallbackData
  const i9 = i8 + byteLength(instructionsArgs)

  let slices = 0n
  for (const [shift, value] of [i0, i1, i2, i3, i4, i5, i6, i7, i8, i9].entries()) {
    slices |= BigInt(value) << BigInt(shift * 16)
  }

  let flags = 0
  if (args.isExactIn) flags |= TAKER_IS_EXACT_IN
  if (args.shouldUnwrapWeth) flags |= TAKER_SHOULD_UNWRAP_WETH
  if (args.isStrictThresholdAmount) flags |= TAKER_IS_STRICT_THRESHOLD
  if (args.isFirstTransferFromTaker) flags |= TAKER_IS_FIRST_TRANSFER_FROM_TAKER
  if (args.useTransferFromAndAquaPush) flags |= TAKER_USE_TRANSFER_FROM_AND_AQUA_PUSH
  if (args.hasPreTransferInCallback) flags |= TAKER_HAS_PRE_TRANSFER_IN_CALLBACK
  if (args.hasPreTransferOutCallback) flags |= TAKER_HAS_PRE_TRANSFER_OUT_CALLBACK

  return concatHex([
    toBytes(slices, 20),
    toBytes(flags, 2),
    threshold,
    toBytesHex,
    deadlineHex,
    instructionsArgs,
  ])
}
