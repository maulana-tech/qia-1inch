/**
 * Satu swap sungguhan lewat posisi kita di registry Aqua RESMI.
 *
 * Syarat track menuntut "onchain execution of token transfers presented during
 * the final demo". `ship()` saja tidak cukup — ia sengaja TIDAK memindahkan
 * token. Yang memindahkan token adalah swap, dan sampai ada satu yang lewat,
 * halaman posisi kita jujur menulis "nobody has swapped through this position
 * yet".
 *
 * # Kenapa perlu alamat kedua
 *
 * Maker tidak bisa jadi taker atas posisinya sendiri — WETH-nya akan kembali ke
 * dompet yang sama dan kekekalan yang diperiksa SwapVM tidak terpenuhi. Sudah
 * dua kali menjatuhkan skrip demo di repo ini, jadi di sini takernya dibuat
 * terpisah.
 *
 * Takernya EFEMERAL: kuncinya dibuat acak tiap jalan, dipakai sekali, lalu
 * hilang saat proses berakhir. Ia tidak pernah dicetak dan tidak pernah
 * disimpan. Yang perlu dipinjam darinya cuma gas, dan token ujinya bisa dicetak
 * sendiri karena `MockERC20.mint` publik.
 *
 *   DESK_KEY=0x… node scripts/demo-swap.mjs
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  parseEther,
  formatUnits,
  decodeAbiParameters,
} from 'viem'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import { ABI } from '@1inch/aqua-sdk'
import { buildTakerData } from '@iqia/swapvm'

const here = dirname(fileURLToPath(import.meta.url))
const env = Object.fromEntries(
  readFileSync(join(here, '..', '.env.local'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)

const DESK_KEY = process.env.DESK_KEY
if (!DESK_KEY) {
  console.error('DESK_KEY is not set.\n  DESK_KEY=0x… node scripts/demo-swap.mjs')
  process.exit(1)
}

/**
 * Dua endpoint, dan pemisahannya bukan gaya-gayaan.
 *
 * tenderly andal untuk `eth_getLogs` — diukur 30 dari 30 panggilan benar,
 * sementara publicnode menjatuhkan sekitar separuhnya secara diam-diam. Tapi
 * tenderly membatasi `eth_sendRawTransaction` dan menolak dengan "rate limit
 * exceeded" pada transaksi pertama.
 *
 * Jadi: baca lewat yang jujur, kirim lewat yang mau menerima.
 */
const RPC = env.VITE_RPC_URL || 'https://sepolia.gateway.tenderly.co'
const WRITE_RPC = process.env.WRITE_RPC || 'https://ethereum-sepolia-rpc.publicnode.com'
const AQUA = env.VITE_AQUA
const ROUTER = env.VITE_SWAP_VM_ROUTER
const MAKER = env.VITE_DESK_MAKER
const WETH = env.VITE_WETH_ADDRESS
const USDC = env.VITE_USDC_ADDRESS

const swapVmAbi = parseAbi([
  'struct Order { address maker; uint256 traits; bytes data; }',
  'function quote(Order order, address tokenIn, address tokenOut, uint256 amount, bytes takerTraitsAndData) view returns (uint256 amountIn, uint256 amountOut, bytes32 orderHash)',
  'function swap(Order order, address tokenIn, address tokenOut, uint256 amount, bytes takerTraitsAndData) returns (uint256 amountIn, uint256 amountOut, bytes32 orderHash)',
])
const erc20 = parseAbi([
  'function mint(address to, uint256 amount)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
])
const ORDER_TUPLE = [
  {
    type: 'tuple',
    components: [
      { name: 'maker', type: 'address' },
      { name: 'traits', type: 'uint256' },
      { name: 'data', type: 'bytes' },
    ],
  },
]

const pub = createPublicClient({ chain: sepolia, transport: http(RPC, { retryCount: 3 }) })
const desk = createWalletClient({
  account: privateKeyToAccount(DESK_KEY),
  chain: sepolia,
  transport: http(WRITE_RPC, { retryCount: 3 }),
})

const ev = (n) => ABI.AQUA_ABI.find((x) => x.type === 'event' && x.name === n)

console.log(`chain ${sepolia.id} · Aqua ${AQUA}`)
console.log(`router ${ROUTER}`)
console.log('')

// --- 1. temukan posisi kita yang masih terbuka -----------------------------
const latest = await pub.getBlockNumber()
const shipped = []
const docked = []
for (let s = latest - 45000n; s <= latest; s += 9000n) {
  const e = s + 8999n > latest ? latest : s + 8999n
  shipped.push(...(await pub.getLogs({ address: AQUA, event: ev('Shipped'), fromBlock: s, toBlock: e })))
  docked.push(...(await pub.getLogs({ address: AQUA, event: ev('Docked'), fromBlock: s, toBlock: e })))
}
const closed = new Set(docked.map((l) => l.args.strategyHash))
const ours = shipped
  .filter((l) => l.args.app.toLowerCase() === ROUTER.toLowerCase() && !closed.has(l.args.strategyHash))
  .at(-1)

if (!ours) {
  console.error('No open position found on this router. Run migrate-to-official-aqua.sh first.')
  process.exit(1)
}
const [order] = decodeAbiParameters(ORDER_TUPLE, ours.args.strategy)
console.log(`position ${ours.args.strategyHash}`)
console.log(`  maker  ${order.maker}`)
console.log('')

// --- 2. taker efemeral ------------------------------------------------------
const taker = privateKeyToAccount(generatePrivateKey())
const takerClient = createWalletClient({ account: taker, chain: sepolia, transport: http(WRITE_RPC, { retryCount: 3 }) })
console.log(`ephemeral taker ${taker.address}`)

/** Resi dibaca dari endpoint tulis — di situlah transaksinya baru saja mendarat. */
const writePub = createPublicClient({ chain: sepolia, transport: http(WRITE_RPC, { retryCount: 5 }) })
const wait = async (hash) => {
  const r = await writePub.waitForTransactionReceipt({ hash, timeout: 180_000 })
  // Jeda kecil: dua endpoint publik berturut-turut tanpa napas adalah cara
  // tercepat kena batas laju, dan skrip demo yang gagal di depan juri lebih
  // buruk daripada skrip demo yang lambat.
  await new Promise((r2) => setTimeout(r2, 1500))
  return r
}

// Gas dipinjam dari maker. Kecil dan sekali pakai.
await wait(await desk.sendTransaction({ to: taker.address, value: parseEther('0.01') }))
console.log('  funded with 0.01 ETH for gas')

// `MockERC20.mint` publik, jadi takernya mencetak sendiri modal ujinya.
const usdcDec = await pub.readContract({ address: USDC, abi: erc20, functionName: 'decimals' })
const amountIn = 250n * 10n ** BigInt(usdcDec)
await wait(await takerClient.writeContract({ address: USDC, abi: erc20, functionName: 'mint', args: [taker.address, amountIn] }))
await wait(await takerClient.writeContract({ address: USDC, abi: erc20, functionName: 'approve', args: [ROUTER, amountIn] }))
console.log(`  minted and approved ${formatUnits(amountIn, usdcDec)} USDC`)
console.log('')

// --- 3. kutip, lalu tukar ---------------------------------------------------
const takerData = buildTakerData({ taker: taker.address, isExactIn: true, useTransferFromAndAquaPush: true })
const args = [{ maker: order.maker, traits: order.traits, data: order.data }, USDC, WETH, amountIn, takerData]

const [, quoted] = await pub.readContract({ address: ROUTER, abi: swapVmAbi, functionName: 'quote', args })
console.log(`quote  ${formatUnits(amountIn, usdcDec)} USDC → ${formatUnits(quoted, 18)} WETH`)

// Ambang 1% di bawah kutipan. Bukan nol — swap tanpa perlindungan slippage
// adalah persis bug yang baru diperbaiki di halaman Swap.
const minOut = (quoted * 99n) / 100n
const guarded = [args[0], args[1], args[2], args[3], buildTakerData({
  taker: taker.address, isExactIn: true, useTransferFromAndAquaPush: true, threshold: minOut,
})]

const wethBefore = await pub.readContract({ address: WETH, abi: erc20, functionName: 'balanceOf', args: [taker.address] })
const hash = await takerClient.writeContract({ address: ROUTER, abi: swapVmAbi, functionName: 'swap', args: guarded })
const receipt = await wait(hash)
const wethAfter = await pub.readContract({ address: WETH, abi: erc20, functionName: 'balanceOf', args: [taker.address] })

console.log('')
console.log('==========================================')
console.log(`swap executed in block ${receipt.blockNumber}`)
console.log(`  tx      https://sepolia.etherscan.io/tx/${hash}`)
console.log(`  taker received ${formatUnits(wethAfter - wethBefore, 18)} WETH`)
console.log(`  logs    ${receipt.logs.length} events, including Aqua Pulled/Pushed`)
console.log('')
console.log('The position page now shows this trade:')
console.log(`  /market/${ours.args.strategyHash}`)
console.log('==========================================')
