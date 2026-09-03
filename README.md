<p align="center">
  <img src="frontend/src/assets/iqia-logo.png" alt="Iqia" width="120" />
</p>

<h1 align="center">Iqia</h1>

<p align="center">
  A shielded trading layer where balances hide behind zero-knowledge proofs and
  liquidity never leaves the market maker's wallet.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Base-Sepolia-1b1b1b" alt="Base Sepolia" />
  <img src="https://img.shields.io/badge/1inch-Aqua%20%C2%B7%20SwapVM-1b1b1b" alt="Aqua / SwapVM" />
  <img src="https://img.shields.io/badge/ZK-UltraHonk%20%C2%B7%20BN254-1b1b1b" alt="UltraHonk / BN254" />
  <img src="https://img.shields.io/badge/Noir-1.0.0--beta.9-1b1b1b" alt="Noir" />
  <img src="https://img.shields.io/badge/License-MIT-1b1b1b" alt="MIT" />
</p>

---

## Status

**Migrasi sedang berjalan.** Aplikasi ini sebelumnya berjalan di chain lain,
dengan mesin pencocokan di dalam enclave tepercaya. Lapisan itu sudah dibuang,
dan likuiditasnya sedang dipindahkan ke **1inch Aqua + SwapVM**.

| Bagian | Keadaan |
|---|---|
| Kolam terlindung (ZK) | ✅ Jalan |
| Sirkuit Noir | ✅ Jalan |
| Transfer privat | ✅ Jalan |
| Mesin pencocokan off-chain | ✅ Jalan |
| Likuiditas lewat Aqua/SwapVM | ✅ Jalan, terbukti on-chain |
| Dua opcode SwapVM custom | ✅ 29 test |
| Swap dari UI | ✅ Jalan, lewat `@iqia/swapvm` |
| Penempatan order | 🚧 Butuh sirkuit yang belum ada |

Peta migrasinya di [`docs/migrasi.md`](docs/migrasi.md).
Rujukan teknis Aqua/SwapVM di [`docs/RESOURCES.md`](docs/RESOURCES.md).

---

## Masalah

Rantai publik menyiarkan niatmu sebelum niat itu dieksekusi. Di order book
on-chain mana pun, ukuran, arah, dan harga yang kamu terima terlihat begitu
transaksi disiarkan — cukup lama untuk didahului, dan cukup permanen untuk
direkonstruksi pesaing setelahnya.

Sisi penyedia likuiditas punya masalah cermin: untuk menyediakan likuiditas,
dananya harus dititipkan ke kolam. Modal terkunci, tidak bisa dipakai untuk
hal lain, dan menariknya kembali butuh transaksi tersendiri.

Selama ini salah satu harus dikorbankan.

## Jawaban Iqia

**Pembeli tersembunyi. Penjual tidak kehilangan kendali atas dananya.**

Sisi pembeli memakai kolam terlindung: saldo menjadi *note commitment* di dalam
Merkle tree, dengan jumlah dan pemilik tersegel di dalam hash. Setiap transisi
keluar dari kolam dijaga bukti UltraHonk yang dibuat di sisi klien.

Sisi penyedia likuiditas memakai **Aqua**. Token tidak pernah pindah dari dompet
market maker — Aqua hanya mencatat izin, dan menariknya saat swap benar-benar
terjadi. Modal yang sama bisa menopang beberapa strategi sekaligus.

Aturan eksekusi yang dulu dijaga enclave secara rahasia menjadi program bytecode
**SwapVM** yang dijalankan on-chain. Enclave tepercaya diganti mesin virtual.

---

## Arsitektur

```
Pengguna
   │ deposit — token pindah ke kolam
   ▼
IqiaPool  (kolam terlindung, ZK)
   │
   │ swap
   ▼
Router SwapVM custom  ──── program bytecode dijalankan on-chain
   │
   ▼
Aqua  ──pull / push──►  dompet market maker
                         token tidak pernah terkunci
```

Di mode Aqua, argumen `app` pada `aqua.ship()` adalah alamat router SwapVM.
Jadi router custom kita **sekaligus** menjadi Aqua app-nya — satu kontrak.

---

## Struktur repo

```
contracts/          Kontrak Solidity (Foundry)
  src/IqiaPool.sol              Kolam, deposit/withdraw, rebalance via Aqua
  src/TransferProcessor.sol     Transfer berbasis ZK
  src/iqia/IqiaSwapVMRouter     Router SwapVM custom, sekaligus Aqua app
  src/iqia/IqiaAquaTaker        Perantara kolam menuju SwapVM
  src/iqia/instructions/        Dua opcode custom
protocol/
  circuits/noir/           5 sirkuit ZK + library bersama
  sdk/                     SDK TypeScript
  swapvm/                  Perakit program SwapVM + pengkode traits
  matcher/                 Mesin pencocokan off-chain
frontend/                  React + Vite + wagmi
docs/                      Peta migrasi dan rujukan Aqua/SwapVM
```

---

## Setup

> Panduan di bawah diuji dari clone bersih: `git clone`, ikuti setiap langkah
> apa adanya, sampai 108 test lolos dan demo on-chain berjalan.

### Prasyarat

| Alat | Versi yang dipakai | Untuk apa |
|---|---|---|
| Node.js | 24.x | SDK, matcher, frontend |
| pnpm | 10.x | Workspace monorepo |
| Foundry | 1.8.x | Kontrak, test, skrip deploy |
| Nargo | 1.0.0-beta.9 | Sirkuit Noir — **opsional**, hanya kalau mau mengubah sirkuit |

**Foundry wajib, dan tidak ada jalan memutar.** Aqua dan SwapVM tidak
dipublikasikan ke npm — `@1inch/aqua` dan `@1inch/swap-vm` dua-duanya 404 di
registry meski README mereka menulis `npm install`. Keduanya proyek Foundry
dengan remapping sendiri, jadi harus di-vendor lewat `forge install`.

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

### 1. Pasang dependensi

```bash
git clone https://github.com/maulana-tech/qia-1inch.git
cd qia-1inch

pnpm install                     # workspace TypeScript
cd contracts && forge install    # submodule aqua, swap-vm, forge-std
npm install                      # lihat catatan di bawah
cd ..
```

`contracts/` punya `node_modules` sendiri, terpisah dari workspace pnpm. Itu
disengaja: Aqua dan SwapVM mencari `@openzeppelin/contracts` dan
`@1inch/solidity-utils` di `node_modules/`, bukan `lib/`, dan versinya dipatok
mengikuti `package.json` mereka.

### 2. Bangun

```bash
pnpm --filter @iqia/sdk build
pnpm --filter @iqia/swapvm build     # WAJIB sebelum frontend
pnpm --filter @iqia/matcher build

cd contracts && forge build && cd ..
```

`@iqia/swapvm` harus dibangun lebih dulu. Frontend mengimpornya sebagai paket
workspace, jadi tanpa `dist/` yang terisi, `pnpm dev` gagal.

Build kontrak memakan waktu karena `via_ir` menyala. Itu tidak bisa dimatikan —
tanpanya compiler kehabisan stack saat mengompilasi SwapVM. Tapi verifier
UltraHonk hasil-generate Noir justru PECAH dengan `via_ir`, jadi keduanya
dikecualikan per-file lewat `compilation_restrictions` di `foundry.toml`.

### 3. Verifikasi

```bash
cd contracts && forge test && cd ..     # 32 test
pnpm --filter @iqia/swapvm test         # 10 test
pnpm --filter @iqia/sdk test            # 41 test
pnpm --filter @iqia/matcher test        # 25 test
pnpm --filter frontend typecheck

cd protocol/circuits/noir/place_order && nargo test && cd -   # 5 test, butuh nargo
```

---

## Menjalankan secara lokal

Tiga terminal, atau jalankan yang pertama di latar belakang.

### 1. Rantai lokal

```bash
anvil
```

### 2. Deploy dan kirim posisi

```bash
cd contracts
forge script script/DemoIqiaDesk.s.sol --rpc-url http://localhost:8545 --broadcast
```

Skrip ini melakukan dua hal. Pertama, menjalankan demo lengkap sebagai transaksi
sungguhan — deploy, buka posisi, swap, tutup posisi — dengan `require` di setiap
langkah, jadi ia gagal kalau klaimnya tidak benar. Kedua, mengirim satu posisi
yang dibiarkan terbuka supaya frontend punya sesuatu untuk diajak berdagang, lalu
mencetak env yang dibutuhkannya.

Salin blok yang dicetaknya:

```
=== Salin ke frontend/.env.local ===
VITE_CHAIN_ID=31337
VITE_CHAIN_NAME=Anvil
VITE_SWAP_VM_ROUTER=0x...
VITE_AQUA=0x...
VITE_DESK_MAKER=0x...
VITE_DESK_SALT=2
VITE_DESK_SURCHARGE_BPS=50000000
VITE_WETH_ADDRESS=0x...
VITE_USDC_ADDRESS=0x...
```

ke `frontend/.env.local`, lalu tambahkan satu baris:

```
VITE_POOL_DEPLOY_BLOCK=0
```

Tanpa baris itu, pembacaan event mulai dari blok yang salah dan daftar market
tampil kosong.

Alamatnya deterministik selama anvil dimulai dari keadaan bersih, jadi env yang
sama bisa dipakai ulang setelah restart.

### 3. Frontend

```bash
pnpm --filter frontend dev
```

Buka `http://localhost:5173`. Halaman `/app` seharusnya menampilkan satu market
**USDC / WETH** dengan likuiditas 35.000 dan 10 — angka yang sama dengan yang
dikirim skrip demo.

---

## Deploy ke testnet

```bash
cd contracts
export PRIVATE_KEY=0x<kunci-deployer>
export RPC_URL=https://sepolia.base.org

forge script script/Deploy.s.sol --rpc-url "$RPC_URL" --broadcast
```

Isi `frontend/.env.local` dengan alamat hasil deploy, dan setel
`VITE_CHAIN_ID=84532`.

SwapVM resmi ada di `0x111111338c5091E8440b67B168bAe16a668AC0De` pada Base
mainnet dan 14 chain lain, **tapi tidak di Base Sepolia**. Untuk testnet, router
custom dideploy sendiri. Menambah opcode memang menuntut itu — set instruksi
ditentukan saat kompilasi.

---

## Kalau ada yang tidak jalan

**Halaman market kosong, muncul error `eth_getLogs is limited to a 10,000 range`.**
Pesannya menyesatkan; masalahnya bukan rentang blok melainkan salah jaringan.
Pastikan `VITE_CHAIN_ID` cocok dengan chain yang berjalan, lalu restart vite —
berkas env hanya dibaca saat server dimulai.

**`Cannot find module '@iqia/swapvm'`.** Paketnya belum dibangun. Jalankan
`pnpm --filter @iqia/swapvm build`.

**`forge build` gagal dengan "Stack too deep".** `via_ir` tidak menyala. Periksa
`contracts/foundry.toml` masih memuat `via_ir = true` beserta kedua blok
`compilation_restrictions`.

**`forge install` menolak dengan "target or .gitmodules has existing changes".**
Commit atau stash dulu perubahan di `contracts/lib/`, baru ulangi.

**Swap gagal padahal market terlihat.** Parameter meja di `.env.local` harus sama
persis dengan yang dipakai maker saat `ship()` — `strategyHash` dihitung dari byte
order-nya, jadi salt atau fee yang meleset menghasilkan hash berbeda dan Aqua
tidak menemukan saldonya.

---

## Demo transfer on-chain

Yang dibuktikan skrip demo, dengan `require` di setiap langkah:

| Langkah | Bukti |
|---|---|
| `ship()` | Saldo dompet maker **tidak berubah sedikit pun**, Aqua menahan nol |
| swap | WETH keluar dari dompet maker, USDC masuk — transfer ERC20 sungguhan |
| | Harga dari kurva `x*y=k` di dalam bytecode, bukan kode Solidity |
| `dock()` | Posisi tutup, **nol transfer token** |

Contoh keluaran: 3.500 USDC masuk, 0,90909… WETH keluar. Sepanjang alur Aqua
tidak pernah menahan satu token pun.

Untuk memeriksanya sendiri, bukan dari log skrip:

```bash
cast logs --rpc-url http://localhost:8545 --from-block 0 \
  'Pulled(address,address,bytes32,address,uint256)'

cast call <WETH> 'balanceOf(address)(uint256)' <MAKER> --rpc-url http://localhost:8545
```

## Catatan teknis

**Desimal.** Token faucet memakai 7 desimal, bukan 18. Sirkuit Noir memaksakan
`assert_64` pada besaran, dan 18 desimal membuat jumlah wajar melampaui rentang
64-bit.

**`IqiaPool.settle()` tidak aktif.** Jalur itu dulu menerima hasil pencocokan
dari enclave tepercaya. Penggantinya SwapVM.

**Belum ada test Solidity.** Menyusul bersama integrasi Aqua/SwapVM, memakai
harness Foundry dari repo SwapVM.

---

## Lisensi

MIT. Lihat [LICENSE](LICENSE).
