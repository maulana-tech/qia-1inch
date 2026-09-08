import { AQUA_CONTRACT_ADDRESSES, NetworkEnum } from '@1inch/aqua-sdk'
import { base, baseSepolia, mainnet, sepolia } from 'wagmi/chains'

/**
 * Konfigurasi deployment untuk frontend Iqia.
 *
 * Setiap nilai bisa ditimpa saat build lewat env var `VITE_*`, jadi satu build
 * bisa diarahkan ke jaringan lain tanpa mengubah kode.
 *
 * Target jaringan: Base Sepolia untuk aplikasi, Base mainnet saat menguji
 * terhadap SwapVM resmi lewat fork lokal. Lihat docs/RESOURCES.md.
 */

// Toleransi kalau `import.meta.env` tidak ada (konteks Node/SSR/test).
const META_ENV = (import.meta.env ?? {}) as Partial<ImportMetaEnv>

function env(key: string, fallback: string): string {
  const v = META_ENV[key as keyof ImportMetaEnv] as string | undefined
  return v && v.length > 0 ? v : fallback
}

function flag(key: string): boolean {
  const v = META_ENV[key as keyof ImportMetaEnv] as string | undefined
  return v === 'true' || v === '1'
}

const ZERO = '0x0000000000000000000000000000000000000000'

const isValidAddress = (a: string) => /^0x[0-9a-fA-F]{40}$/.test(a)

// ---------------------------------------------------------------------------
// Jaringan
// ---------------------------------------------------------------------------

/** Chain id yang dituju aplikasi. Base Sepolia = 84532, Base mainnet = 8453. */
export const CHAIN_ID = Number(env('VITE_CHAIN_ID', '84532'))

/** Nama jaringan untuk ditampilkan. */
export const CHAIN_NAME = env('VITE_CHAIN_NAME', 'Base Sepolia')

/** Basis URL block explorer. */
/**
 * Explorer untuk rantai aktif.
 *
 * Diturunkan dari definisi chain viem, bukan variabel lepas. Sebelumnya ia env
 * tersendiri dengan bawaan Basescan — jadi konfigurasi yang lupa mengisinya akan
 * menautkan alamat Ethereum Sepolia ke explorer Base, dan tautannya membuka
 * halaman "alamat tidak ditemukan" tanpa petunjuk apa pun soal sebabnya.
 *
 * `VITE_EXPLORER_URL` tetap menang kalau diisi, untuk explorer alternatif.
 */
const CHAIN_EXPLORERS: Record<number, string> = {
  [mainnet.id]: mainnet.blockExplorers.default.url,
  [sepolia.id]: sepolia.blockExplorers.default.url,
  [base.id]: base.blockExplorers.default.url,
  [baseSepolia.id]: baseSepolia.blockExplorers.default.url,
}

export const EXPLORER_URL =
  env('VITE_EXPLORER_URL', '') || CHAIN_EXPLORERS[CHAIN_ID] || ''

/** Anvil tidak punya explorer. Tautan ke sana cuma menyesatkan. */
export const HAS_EXPLORER = EXPLORER_URL !== ''

/**
 * Tautan explorer, atau `undefined` kalau rantainya tidak punya explorer.
 *
 * Sengaja `undefined`, bukan string kosong: `href={undefined}` membuat React
 * tidak menulis atribut itu sama sekali, jadi elemennya jadi teks biasa alih-alih
 * tautan yang membawa orang ke halaman kosong. Di anvil dulu ia menghasilkan
 * `/tx/0x…` yang ditangkap router aplikasi dan melempar balik ke landing.
 */
export const explorerTxUrl = (hash: string): string | undefined =>
  HAS_EXPLORER ? `${EXPLORER_URL}/tx/${hash}` : undefined

export const explorerContractUrl = (address: string): string | undefined =>
  HAS_EXPLORER ? `${EXPLORER_URL}/address/${address}` : undefined

// ---------------------------------------------------------------------------
// Aqua / SwapVM
//
// Diisi oleh contracts/script/deploy.sh. Terbukti memindahkan token on-chain
// lewat contracts/script/DemoIqiaDesk.s.sol, dan programnya dirakit
// @iqia/swapvm dengan byte yang identik dengan Solidity.
// ---------------------------------------------------------------------------

/**
 * Registry saldo virtual Aqua.
 *
 * Di rantai yang didukung, alamatnya diambil dari SDK resmi 1inch — Aqua sudah
 * ter-deploy di 16 jaringan dengan alamat yang sama
 * (`0x1111113ccf1426a8e30e2bff5e005d929bf6a90a`), termasuk Base mainnet. Tidak
 * ada satu pun testnet di daftar itu, jadi untuk anvil dan Base Sepolia alamat
 * hasil deploy sendiri diambil dari env.
 *
 * `VITE_AQUA` tetap menang kalau diisi, supaya fork lokal dari rantai yang
 * didukung tetap bisa menunjuk alamat lain.
 */
export const AQUA_ADDRESS =
  env('VITE_AQUA', '') ||
  AQUA_CONTRACT_ADDRESSES[CHAIN_ID as NetworkEnum]?.toString() ||
  ZERO

/** Router SwapVM custom milik Iqia. Sekaligus berperan sebagai Aqua app. */
export const SWAP_VM_ROUTER_ADDRESS = env('VITE_SWAP_VM_ROUTER', ZERO)

// --- Posisi meja ---
//
// Parameter ini harus sama persis dengan yang dipakai maker saat ship(),
// karena strategyHash dihitung dari byte order-nya. Meleset satu bit berarti
// Aqua tidak menemukan saldonya.

/** Market maker yang menopang meja. */
export const DESK_MAKER = env('VITE_DESK_MAKER', '')

/** Pembeda strategi. Harus sama dengan yang dipakai saat ship(). */
export const DESK_SALT = BigInt(env('VITE_DESK_SALT', '1'))

/** Fee tetap sisi masukan, dalam basis 1e9. 0 berarti tanpa fee. */
export const DESK_FEE_BPS = BigInt(env('VITE_DESK_FEE_BPS', '0'))

/** Biaya tambahan maksimum SolvencyGuard, basis 1e9. 0 mematikan opcode-nya. */
export const DESK_SURCHARGE_BPS = BigInt(env('VITE_DESK_SURCHARGE_BPS', '0'))

/**
 * Fee yang dipungut posisi tabungan, basis 1e9. Default 0,3%.
 *
 * Tanpa fee, posisi market making tidak menghasilkan apa pun: penukar mendapat
 * harga kurva murni dan maker hanya menanggung pergerakan inventarisnya. Fee
 * inilah yang membuat "menabung" benar-benar berarti sesuatu.
 */
export const SAVINGS_FEE_BPS = BigInt(env('VITE_SAVINGS_FEE_BPS', '2500000'))

/**
 * Model bisnisnya: potongan kecil ke treasury, di swap yang sama.
 *
 * Bukan langganan, bukan biaya penarikan, bukan mengunci dana. Kalau tidak ada
 * yang menukar lewat posisi penggunanya, aplikasi ini tidak dapat apa-apa —
 * persis seperti makernya. Tertulis di bytecode posisi, jadi siapa pun bisa
 * membongkarnya dan melihat berapa yang diambil dan ke mana.
 *
 * Nol berarti mati: tanpa alamat treasury, instruksinya tidak disisipkan sama
 * sekali. Kontraknya menolak penerima alamat nol, jadi separuh konfigurasi akan
 * menggagalkan setiap swap alih-alih diam-diam mengambil ke mana-mana.
 */
export const TREASURY_ADDRESS = env('VITE_TREASURY', '')

export const PROTOCOL_FEE_BPS = isValidAddress(TREASURY_ADDRESS)
  ? BigInt(env('VITE_PROTOCOL_FEE_BPS', '500000'))
  : 0n

/** Kalau diisi, hanya alamat ini yang boleh mengisi order meja. */
export const DESK_EXCLUSIVE_TAKER = env('VITE_DESK_EXCLUSIVE_TAKER', '')

/**
 * True kalau Aqua bisa dibaca.
 *
 * Sengaja TIDAK menuntut router kita ada. Membaca posisi market maker lain di
 * router SwapVM resmi tidak butuh apa pun milik kita, dan di Base mainnet
 * memang begitu keadaannya — Aqua ada di sana, router kita belum.
 */
export const AQUA_CONFIGURED = isValidAddress(AQUA_ADDRESS)

/**
 * True kalau meja kita sendiri bisa dipakai: mengirim posisi dengan opcode 22
 * dan 23 menuntut router Iqia yang sudah ter-deploy di rantai ini.
 */
export const DESK_CONFIGURED = AQUA_CONFIGURED && isValidAddress(SWAP_VM_ROUTER_ADDRESS)

// ---------------------------------------------------------------------------
// Token faucet
//
// Angka desimal di sini warisan aplikasi asal dan TIDAK cocok dengan mock yang
// ter-deploy. Untuk apa pun yang memindahkan token, baca dari kontraknya lewat
// `tokenDecimals()` di lib/payments.ts.
// ---------------------------------------------------------------------------

export const MOCK_WETH_ADDRESS = env('VITE_WETH_ADDRESS', '')
export const MOCK_USDC_ADDRESS = env('VITE_USDC_ADDRESS', '')
export const MOCK_WBTC_ADDRESS = env('VITE_WBTC_ADDRESS', '')
export const MOCK_DAI_ADDRESS = env('VITE_DAI_ADDRESS', '')

/** Apakah token mock sudah dideploy dan dikonfigurasi. */
/**
 * True kalau ADA token uji yang bisa dicetak di rantai ini.
 *
 * Dulu syaratnya USDC **dan** WBTC. Di Sepolia cuma WETH dan USDC yang
 * ter-deploy, jadi halaman Faucet memperingatkan "alamat belum diisi" padahal
 * dua token yang ada sepenuhnya bisa dipakai — peringatan yang salah lebih
 * buruk daripada tidak ada peringatan.
 */
export const MOCK_TOKENS_DEPLOYED = [
  MOCK_WETH_ADDRESS,
  MOCK_USDC_ADDRESS,
  MOCK_WBTC_ADDRESS,
  MOCK_DAI_ADDRESS,
].some(isValidAddress)

// ---------------------------------------------------------------------------
// Layanan
// ---------------------------------------------------------------------------

/** Basis URL mesin pencocokan off-chain. Kosong = pencocokan mati. */
export const MATCHER_URL = env('VITE_MATCHER_URL', '')

/** Blok saat kolam dideploy — lantai awal untuk indexer di sisi klien. */
export const POOL_DEPLOY_BLOCK = Number(env('VITE_POOL_DEPLOY_BLOCK', '0'))

/**
 * Router SwapVM resmi 1inch — alamat yang sama di Base mainnet dan 14 chain lain.
 *
 * Ini "Aqua app" yang dipakai market maker sungguhan. Posisinya memakai format
 * `Order` SwapVM yang persis sama dengan yang dirakit `@iqia/swapvm`, jadi kita
 * bisa membacanya. Yang tidak bisa cuma mengirim strategi ke sana: opcode 22 dan
 * 23 milik kita tidak ada di set instruksinya.
 */
export const OFFICIAL_SWAP_VM_ROUTER = '0x111111338c5091E8440b67B168bAe16a668AC0De'

/**
 * Seberapa jauh ke belakang event Aqua disapu, dalam blok.
 *
 * Nol berarti dari `POOL_DEPLOY_BLOCK` — masuk akal di anvil yang riwayatnya
 * pendek. Di rantai publik itu mustahil: RPC menolak rentang di atas 10.000
 * blok, dan menyapu sejuta blok akan makan ratusan panggilan. Bawaannya kira-kira
 * sehari di Base (blok 2 detik) — dipilih supaya muat di jatah RPC publik.
 * Dengan RPC berbayar, naikkan lewat env ini.
 */
export const MARKETS_LOOKBACK_BLOCKS = Number(
  env('VITE_MARKETS_LOOKBACK_BLOCKS', CHAIN_ID === 31337 ? '0' : '45000'),
)

/** Batas rentang satu panggilan `eth_getLogs`. RPC publik umumnya 10.000. */
export const LOGS_CHUNK_BLOCKS = Number(env('VITE_LOGS_CHUNK_BLOCKS', '9500'))

/**
 * RPC yang dipakai untuk rantai aktif. Kosong berarti bawaan viem.
 *
 * Ada supaya fork lokal bisa dipakai: `anvil --fork-url … --chain-id 8453`
 * menyajikan chain 8453 di `localhost:8546`, dan tanpa ini wagmi tetap menembak
 * RPC publik Base — jadi kontrak yang baru saja di-deploy ke fork tidak akan
 * pernah terlihat.
 */
export const RPC_URL = env('VITE_RPC_URL', '')

/** Kalau true, aplikasi memakai MockIqiaSdk offline alih-alih klien live. */
export const USE_MOCK = flag('VITE_USE_MOCK')

// ---------------------------------------------------------------------------
// Aset
// ---------------------------------------------------------------------------

