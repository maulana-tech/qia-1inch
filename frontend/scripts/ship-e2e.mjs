// Bukti ujung-ke-ujung: ship dan dock lewat @1inch/aqua-sdk resmi, dengan
// program strategi yang dirakit @iqia/swapvm — persis jalur yang dipakai UI.
//
// Butuh anvil yang sudah dideploy:
//   anvil
//   cd contracts && forge script script/DemoIqiaDesk.s.sol --rpc-url http://127.0.0.1:8545 \
//     --broadcast --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
//   cd frontend && pnpm ship:e2e
//
// Yang dibuktikan, dan tiap langkah punya assert-nya sendiri:
//   - calldata SDK resmi diterima kontrak Aqua sungguhan
//   - strategyHash SDK sama dengan keccak256 kita
//   - rawBalances membaca balik persis yang dikirim
//   - saldo DOMPET tidak bergerak sedikit pun — inti janji Aqua
//   - dock mengosongkan posisinya
import { AquaProtocolContract, Address as AquaAddress, HexString, ABI } from '@1inch/aqua-sdk'
import { buildOrder, encodeOrder, flatFeeIn, program, salt, solvencyGuard, xycSwap } from '@iqia/swapvm'
import { createWalletClient, createPublicClient, http, parseAbi, keccak256 } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { foundry } from 'viem/chains'
import assert from 'node:assert'

const AQUA = '0x5FbDB2315678afecb367f032d93F642f64180aa3'
const ROUTER = '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9'
const WETH = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512'
const USDC = '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0'

const account = privateKeyToAccount('0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a') // anvil #2
const wallet = createWalletClient({ account, chain: foundry, transport: http('http://127.0.0.1:8545') })
const pub = createPublicClient({ chain: foundry, transport: http('http://127.0.0.1:8545') })

const send = async (req) => {
  const hash = await wallet.sendTransaction(req)
  const r = await pub.waitForTransactionReceipt({ hash })
  assert.equal(r.status, 'success', `tx gagal: ${hash}`)
  return hash
}
const write = async (address, sig, args) =>
  send({ to: address, data: (await import('viem')).encodeFunctionData({ abi: parseAbi([sig]), args }) })

// 1. cetak token untuk maker
const AMT_W = 10n ** 18n, AMT_U = 3000n * 10n ** 6n
await write(WETH, 'function mint(address to, uint256 amount) public', [account.address, AMT_W])
await write(USDC, 'function mint(address to, uint256 amount) public', [account.address, AMT_U])
console.log('1. token dicetak')

// 2. izinkan Aqua
const MAX = 2n ** 256n - 1n
await write(WETH, 'function approve(address spender, uint256 value) returns (bool)', [AQUA, MAX])
await write(USDC, 'function approve(address spender, uint256 value) returns (bool)', [AQUA, MAX])
console.log('2. approve ke Aqua')

// 3. rakit program strategi "Santai" persis seperti UI
// Salt harus baru tiap jalan. Aqua menandai strategi yang sudah di-dock sebagai
// 0xff, sedangkan ship menuntut 0 — jadi satu strategyHash cuma bisa dipakai
// SEKALI seumur hidup. Salt tetap akan membuat jalan kedua gagal dengan
// StrategiesMustBeImmutable.
const saltValue = BigInt(Date.now())
const prog = program(solvencyGuard(50_000_000n), flatFeeIn(3_000_000n), xycSwap(), salt(saltValue))
const order = buildOrder({ maker: account.address, program: prog })
const strategy = encodeOrder(order)
const expectedHash = keccak256(strategy)
console.log('3. program :', prog)

// 4. ship lewat SDK resmi
const erc20 = parseAbi(['function balanceOf(address) view returns (uint256)'])
const walletBefore = await pub.readContract({ address: WETH, abi: erc20, functionName: 'balanceOf', args: [account.address] })
const aqua = new AquaProtocolContract(new AquaAddress(AQUA))
const shipTx = aqua.ship({
  app: new AquaAddress(ROUTER),
  strategy: new HexString(strategy),
  amountsAndTokens: [
    { token: new AquaAddress(WETH), amount: AMT_W },
    { token: new AquaAddress(USDC), amount: AMT_U },
  ],
})
await send({ to: shipTx.to, data: shipTx.data, value: shipTx.value })
console.log('4. ship terkirim, strategyHash', expectedHash)

assert.equal(
  AquaProtocolContract.calculateStrategyHash(new HexString(strategy)).toString(),
  expectedHash,
  'strategyHash SDK harus sama dengan keccak256 kita',
)

// Sejak titik ini posisinya sudah hidup di rantai, jadi apa pun yang gagal di
// bawah harus tetap menutupnya. Tanpa ini, jalan yang gagal di tengah
// meninggalkan posisi menggantung yang muncul di halaman Markets selamanya.
let shipped = true
try {

// 5. saldo posisi harus tercatat
const bal = async (token) =>
  (await pub.readContract({ address: AQUA, abi: ABI.AQUA_ABI, functionName: 'rawBalances',
    args: [account.address, ROUTER, expectedHash, token] }))[0]
assert.equal(await bal(WETH), AMT_W, 'saldo WETH posisi harus sama dengan yang dikirim')
assert.equal(await bal(USDC), AMT_U, 'saldo USDC posisi harus sama dengan yang dikirim')
console.log('5. rawBalances cocok:', await bal(WETH), await bal(USDC))

// 6. token TIDAK boleh pindah dari dompet — inti janji Aqua.
//    Dibandingkan sebelum lawan sesudah, bukan terhadap jumlah yang dicetak:
//    dompetnya menumpuk hasil cetak dari jalan sebelumnya.
const walletAfter = await pub.readContract({ address: WETH, abi: erc20, functionName: 'balanceOf', args: [account.address] })
assert.equal(walletAfter, walletBefore, 'ship tidak boleh memindahkan token')
console.log('6. saldo dompet tidak bergerak:', walletBefore, '->', walletAfter)

} finally {
  if (shipped) {
    // 7. dock lewat SDK
    const dockTx = aqua.dock({
      app: new AquaAddress(ROUTER),
      strategyHash: new HexString(expectedHash),
      tokens: [new AquaAddress(WETH), new AquaAddress(USDC)],
    })
    await send({ to: dockTx.to, data: dockTx.data, value: dockTx.value })
    const sisa = await pub.readContract({ address: AQUA, abi: ABI.AQUA_ABI, functionName: 'rawBalances',
      args: [account.address, ROUTER, expectedHash, WETH] })
    assert.equal(sisa[0], 0n, 'dock harus mengosongkan posisi')
    console.log('7. dock berhasil, posisi kosong')
  }
}

console.log('\nSEMUA LOLOS')
