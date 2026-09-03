/**
 * Konfigurasi deployment untuk frontend Iqia.
 *
 * Setiap nilai bisa ditimpa saat build lewat env var `VITE_*`, jadi satu build
 * bisa diarahkan ke jaringan lain tanpa mengubah kode.
 *
 * Target jaringan: Base Sepolia untuk aplikasi, Base mainnet saat menguji
 * terhadap SwapVM resmi lewat fork lokal. Lihat docs/RESOURCES.md.
 */
import { NATIVE_ASSET_ID, toField, type Field } from '@iqia/sdk'
import type { AssetCode } from './iqia-sdk'

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
export const EXPLORER_URL = env('VITE_EXPLORER_URL', 'https://sepolia.basescan.org')

export const explorerTxUrl = (hash: string) => `${EXPLORER_URL}/tx/${hash}`
export const explorerContractUrl = (address: string) => `${EXPLORER_URL}/address/${address}`

// ---------------------------------------------------------------------------
// Kontrak inti
// ---------------------------------------------------------------------------

/** Kontrak IqiaPool — kolam terlindung. */
export const POOL_CONTRACT_ID = env('VITE_IQIA_POOL', ZERO)

/** TransferProcessor — transfer privat berbasis ZK. */
export const TRANSFER_PROCESSOR_ADDRESS = env('VITE_TRANSFER_PROCESSOR', ZERO)

// ---------------------------------------------------------------------------
// Aqua / SwapVM
//
// Diisi setelah router dideploy — lihat DEPLOYMENTS.md. Kontraknya sudah jalan
// dan terbukti memindahkan token on-chain lewat
// contracts/script/DemoIqiaDesk.s.sol; yang belum ada adalah perakit program
// SwapVM di sisi TypeScript.
// ---------------------------------------------------------------------------

/** Registry saldo virtual Aqua. */
export const AQUA_ADDRESS = env('VITE_AQUA', ZERO)

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

/** Kalau diisi, hanya alamat ini yang boleh mengisi order meja. */
export const DESK_EXCLUSIVE_TAKER = env('VITE_DESK_EXCLUSIVE_TAKER', '')

/** True kalau lapisan Aqua/SwapVM sudah dikonfigurasi. */
export const AQUA_CONFIGURED =
  isValidAddress(AQUA_ADDRESS) && isValidAddress(SWAP_VM_ROUTER_ADDRESS)

// ---------------------------------------------------------------------------
// Token faucet
//
// Memakai 7 desimal, bukan 18. Sirkuit Noir memaksakan `assert_64` pada besaran,
// dan 18 desimal membuat jumlah wajar melampaui rentang 64-bit.
// ---------------------------------------------------------------------------

export const MOCK_WETH_ADDRESS = env('VITE_WETH_ADDRESS', '')
export const MOCK_USDC_ADDRESS = env('VITE_USDC_ADDRESS', '')
export const MOCK_WBTC_ADDRESS = env('VITE_WBTC_ADDRESS', '')
export const MOCK_DAI_ADDRESS = env('VITE_DAI_ADDRESS', '')

/** Apakah token mock sudah dideploy dan dikonfigurasi. */
export const MOCK_TOKENS_DEPLOYED = isValidAddress(MOCK_USDC_ADDRESS) && isValidAddress(MOCK_WBTC_ADDRESS)

// ---------------------------------------------------------------------------
// Layanan
// ---------------------------------------------------------------------------

/** Basis URL mesin pencocokan off-chain. Kosong = pencocokan mati. */
export const MATCHER_URL = env('VITE_MATCHER_URL', '')

/** Blok saat kolam dideploy — lantai awal untuk indexer di sisi klien. */
export const POOL_DEPLOY_BLOCK = Number(env('VITE_POOL_DEPLOY_BLOCK', '0'))

/** Kalau true, aplikasi memakai MockIqiaSdk offline alih-alih klien live. */
export const USE_MOCK = flag('VITE_USE_MOCK')

// ---------------------------------------------------------------------------
// Aset
// ---------------------------------------------------------------------------

/** Konfigurasi per aset. `assetId` adalah field id di dalam sirkuit (native = 0). */
export interface AssetConfig {
  code: AssetCode
  /** Pengenal field yang dipakai di note dan commitment. */
  assetId: Field
  /** Alamat kontrak ERC20, atau undefined kalau belum ada di jaringan ini. */
  sac: string | undefined
  /** Desimal fixed-point on-chain. */
  decimals: number
  /** Perkiraan harga tampilan (USD), hanya untuk portofolio. */
  priceUsd: number
}

function erc20Asset(code: AssetCode, address: string, decimals: number, priceUsd: number): AssetConfig {
  const valid = /^0x[0-9a-fA-F]{40}$/.test(address)
  return {
    code,
    assetId: valid ? toField(BigInt(address)) : 0n,
    sac: valid ? address : undefined,
    decimals,
    priceUsd,
  }
}

export const ASSET_CONFIG: Record<AssetCode, AssetConfig> = {
  ETH: { code: 'ETH', assetId: NATIVE_ASSET_ID, sac: undefined, decimals: 18, priceUsd: 3500 },
  WETH: erc20Asset('WETH', MOCK_WETH_ADDRESS, 18, 3500),
  USDC: erc20Asset('USDC', MOCK_USDC_ADDRESS, 7, 1),
  WBTC: erc20Asset('WBTC', MOCK_WBTC_ADDRESS, 7, 65000),
  DAI: erc20Asset('DAI', MOCK_DAI_ADDRESS, 7, 1),
}
