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
| Likuiditas lewat Aqua/SwapVM | 🚧 Sedang dikerjakan |
| Penempatan order | 🚧 Menunggu router SwapVM |

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
  src/IqiaPool.sol         Kolam terlindung
  src/TransferProcessor    Transfer privat berbasis ZK
  src/SimpleAMM.sol        AMM sementara — akan diganti Aqua + SwapVM
protocol/
  circuits/noir/           5 sirkuit ZK + library bersama
  sdk/                     SDK TypeScript
  matcher/                 Mesin pencocokan off-chain
frontend/                  React + Vite + wagmi
docs/                      Peta migrasi dan rujukan Aqua/SwapVM
```

---

## Menjalankan

```bash
pnpm install
pnpm --filter @iqia/sdk build

pnpm --filter @iqia/sdk test        # 41 test
pnpm --filter @iqia/matcher test    # 25 test
pnpm --filter frontend typecheck
pnpm --filter frontend dev

cd protocol/circuits/noir/place_order && nargo test
```

Kontraknya butuh Foundry:

```bash
curl -L https://foundry.paradigm.xyz | bash && foundryup
cd contracts && forge build && forge test
```

---

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
