# Frontend Iqia

Aplikasi React untuk **Iqia**. Vite + wagmi/viem + Tailwind.

## Modul

| Rute | Halaman | Fungsi |
|---|---|---|
| `/` | `Hub` | Beranda, ikhtisar |
| `/deposit` | `DepositPage` | Deposit ke kolam terlindung, dan withdraw lewat bukti ZK |
| `/swap` | `SwapPage` | Swap instan, dan penempatan order tersembunyi |
| `/pay` | `PayPage` | Bayar ke pengguna lain di dalam kolam |
| `/receive` | `ReceivePage` | Tampilkan owner key untuk menerima |
| `/portfolio` | `PortfolioPage` | Saldo terlindung dan riwayat |
| `/settings` | `SettingsPage` | Jaringan, bahasa, tema |

## Jaringan

Target: **Base Sepolia** (chain id 84532). Dompet lewat wagmi `injected()`,
jadi MetaMask dan sejenisnya langsung jalan.

Setiap alamat kontrak bisa ditimpa lewat env var `VITE_*` — daftar lengkapnya
ada di `src/vite-env.d.ts`. Alamat deployment ada di `../DEPLOYMENTS.md`.

## Menjalankan

```bash
pnpm install
pnpm --filter @iqia/sdk build     # frontend mengimpor @iqia/sdk
pnpm --filter frontend dev
pnpm --filter frontend typecheck
pnpm --filter frontend build
```

Tanpa deployment, jalankan dengan SDK tiruan:

```bash
VITE_USE_MOCK=true pnpm --filter frontend dev
```

## Keadaan saat ini

Lapisan likuiditas sedang dipindahkan ke **1inch Aqua + SwapVM**.

- Deposit, withdraw, transfer privat, portofolio — **jalan**
- Swap instan — masih lewat `SimpleAMM`, akan pindah ke Aqua
- Penempatan order — **menunggu router SwapVM**, `sdk.placeOrder()` melempar
  error yang menjelaskan hal itu

Lihat [`../docs/migrasi.md`](../docs/migrasi.md).

## Catatan

Token faucet memakai 7 desimal, bukan 18. Sirkuit Noir memaksakan `assert_64`
pada besaran, dan 18 desimal membuat jumlah wajar melampaui rentang 64-bit.

Bukti dibuat di dalam browser lewat `@aztec/bb.js`. Berat — komponen
`ProofProgress` menampilkan kemajuannya.
