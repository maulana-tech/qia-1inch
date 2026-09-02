# Migrasi Larel → Aqua / SwapVM

Hasil studi kode `main/` dan rencana pemindahannya ke stack 1inch Aqua + SwapVM.

Referensi teknis Aqua/SwapVM ada di [RESOURCES.md](./RESOURCES.md).

---

## 1. Ringkasan aplikasi saat ini

**Larel** — lapisan trading rahasia di Flare Coston2. Saldo disembunyikan di balik
*note commitment* dalam Merkle tree, dan order dicocokkan di dalam TEE
(Trusted Execution Environment) sehingga operator pun tidak melihat buku order.

### Komponen

| Bagian | Isi | Ukuran |
|---|---|---|
| `contracts/src` | 7 kontrak Solidity | ~830 baris tulis tangan + ~3.800 baris generated |
| `protocol/circuits/noir` | 5 sirkuit + 1 library | 1.185 baris |
| `protocol/sdk` | SDK TypeScript | 1.891 baris |
| `protocol/matcher` | Mesin pencocokan order | 711 baris |
| `protocol/fce-matcher` | Layanan TEE ber-Docker | — |
| `frontend` | React + Vite + wagmi | 23 komponen, 7 halaman |

### Kontrak

| File | Baris | Fungsi |
|---|---|---|
| `LarelPool.sol` | 237 | **Inti.** Deposit, withdraw, Merkle tree, settle hasil TEE |
| `SimpleAMM.sol` | 216 | Uniswap V2 polos. **Tanpa fee sama sekali** |
| `LarelBridge.sol` | 168 | Escrow lock/unlock lintas chain |
| `TransferProcessor.sol` | 82 | Transfer privat berbasis ZK |
| `LarelInstructionSender.sol` | 60 | Kirim order terenkripsi ke TEE |
| `HonkVerifier.sol` | 1.914 | Generated Noir/Aztec |
| `TransferVerifier.sol` | 1.914 | Generated Noir/Aztec |

### Alur swap yang ada

Komponen `Swap.tsx` punya dua mode:

```
Mode "Instant (AMM)"  → sdk.swapShielded()  → SimpleAMM     ← target migrasi
Mode limit order      → sdk.placeOrder()    → TEE matcher   ← dipertahankan
```

---

## 2. Ketegangan inti — baca ini dulu

Ini yang membuat migrasi tidak bisa dilakukan secara naif.

**Larel menitipkan dana. Aqua justru menolak menitipkan dana.**

| | Larel | Aqua |
|---|---|---|
| Di mana token berada | Di dalam kontrak `LarelPool` | Tetap di dompet pemilik |
| Cara masuk | `deposit()` — token benar-benar pindah | `ship()` — hanya catatan allowance |
| Kenapa begitu | Saldo harus tersembunyi. Saldo di dompet publik itu... publik | Efisiensi modal. Modal tidak terkunci |

Kedua model ini **bertabrakan langsung**. Tidak mungkin punya saldo rahasia yang
sekaligus masih terlihat di dompetmu.

### Cara memecahkannya

Larel dan Aqua berada di **dua sisi berbeda dari transaksi yang sama**.

- **Sisi taker** (yang melakukan swap) → tetap Larel. Rahasia, dananya di pool.
- **Sisi maker** (penyedia likuiditas) → pindah ke Aqua. Dananya di dompet, tidak terkunci.

Jadi bukan "Larel diganti Aqua", tapi **`SimpleAMM` diganti Aqua**.

Ini justru memperkuat ceritanya:

> **Dark pool yang likuiditasnya datang dari dompet market maker yang tidak pernah terkunci.
> Pembeli tersembunyi. Penjual tidak kehilangan kendali atas dananya.**

Kedua sisi mendapat sesuatu yang selama ini harus dikorbankan.

---

## 3. Arsitektur

### Sebelum

```
Pengguna
   │ deposit (token pindah)
   ▼
LarelPool ──── swapShielded ────► SimpleAMM
   │                               └─ menahan reserve sendiri
   │                                  tanpa fee, x*y=k polos
   └──── placeOrder ────► TEE matcher ────► settle()
```

### Sesudah

```
Pengguna
   │ deposit (token pindah)
   ▼
LarelPool ──── swapShielded ────► SwapVM Router (custom)
   │                                  │
   │                                  ├─ jalankan program bytecode
   │                                  │
   │                                  ▼
   │                                Aqua ──pull/push──► dompet market maker
   │                                                     (token tidak pernah terkunci)
   │
   └──── placeOrder ────► TEE matcher ────► settle()   [tidak berubah]
```

`LarelPool` berperan sebagai **taker**. Router SwapVM custom kita sekaligus menjadi
**Aqua app**-nya — lihat Temuan #7 di RESOURCES.md, di mode Aqua argumen `app` adalah
alamat router.

---

## 4. Peta migrasi per komponen

### Dipertahankan tanpa perubahan

| Komponen | Alasan |
|---|---|
| 5 sirkuit Noir | Tidak menyentuh likuiditas sama sekali |
| `HonkVerifier`, `TransferVerifier` | Generated, tidak ada urusan dengan swap |
| `LarelPool` — deposit, withdraw, Merkle | Lapisan privasi tetap utuh |
| `TransferProcessor` | Transfer privat, di luar jalur swap |
| `protocol/matcher`, `fce-matcher` | Dark pool order-book tetap jalan |
| `protocol/sdk` — note, merkle, poseidon, prover | Semua urusan ZK tidak berubah |
| Frontend — Pay, Receive, Portfolio, Bridge | Tidak menyentuh AMM |

### Diganti

| Lama | Baru | Catatan |
|---|---|---|
| `SimpleAMM.sol` (216 baris) | Router SwapVM custom + program Aqua | **Titik migrasi utama** |
| `sdk/real-sdk.ts` → `swapShielded` | Panggil `swapVM.swap()` lewat Aqua | Satu fungsi |
| Reserve di dalam kontrak AMM | Saldo virtual di Aqua | Berubah total modelnya |

### Ditambah

| Komponen | Perkiraan | Fungsi |
|---|---|---|
| `AquaTakerAdapter.sol` | ~80 baris | Jembatan agar `LarelPool` bisa jadi taker SwapVM |
| Router SwapVM custom | ~30 baris | Salinan `AquaSwapVMRouter.sol` |
| Opcode set custom | ~55 baris | `AquaOpcodes` + `Stop` + opcode kita |
| Opcode custom | ~60–90 baris | **Belum diputuskan** — lihat bagian 6 |
| Test suite Foundry | ~400 baris | Belum ada sama sekali, lihat Temuan #3 |
| Halaman maker di frontend | — | Buka/tutup posisi likuiditas |

### Dibuang

| Komponen | Alasan |
|---|---|
| `SimpleAMM.sol` | Digantikan seluruhnya |
| 5 alamat pool SimpleAMM di `DEPLOYMENTS.md` | Tidak dipakai lagi |
| Logika LP token (`liquidity`, `totalLiquidity`) | Aqua tidak memakai LP token |

---

## 5. Titik sentuh kode

Urutan sesuai kedalaman perubahan.

**1. `contracts/src/SimpleAMM.sol`** — hapus seluruhnya.

**2. `contracts/src/AquaTakerAdapter.sol`** — baru.
`LarelPool` memegang token, jadi adapter harus:
- Menerima permintaan swap dari `LarelPool`
- Memanggil `swapVM.swap()` dengan taker traits yang benar
- Mengembalikan token hasil ke `LarelPool`

Referensi: `swap-vm/test/mocks/MockTaker.sol` (72 baris).

**3. `frontend/src/lib/real-sdk.ts`** — fungsi `swapShielded` diarahkan ke adapter.

**4. `frontend/src/lib/config.ts`** — ganti alamat pool AMM dengan alamat router + Aqua.

**5. `frontend/src/components/Swap.tsx`** — label "Instant (AMM)" dan sumber quote.
Quote sekarang dari `swapVM.quote()`, bukan `getAmountOut()`.

**6. `frontend/src/hooks/usePriceQuote.ts`** — sumber harga berubah.

**7. `DEPLOYMENTS.md`** — tabel alamat baru.

---

## 6. Keputusan yang harus diambil

Belum ada yang diputuskan. Semua ini memblokir mulai koding.

### Chain

**Flare Coston2 tidak termasuk 15 chain tempat SwapVM sudah dideploy.**
Daftarnya: Ethereum, Base, Optimism, Polygon, Arbitrum, Avalanche, BSC, Linea,
Sonic, Unichain, Gnosis, zkSync, Cronos, Monad, HyperEVM.

Tiga pilihan:

| Pilihan | Untung | Rugi |
|---|---|---|
| Deploy SwapVM sendiri di Coston2 | App tetap utuh, TEE Flare tetap jalan | Bukan alamat resmi — perlu dijelaskan ke juri |
| Pindah demo ke Base/Arbitrum | Pakai SwapVM resmi | TEE Flare hilang, fitur dark pool ikut hilang |
| Fork lokal | Paling gampang, syarat terpenuhi | Kurang meyakinkan saat demo |

Syarat hackathon mengizinkan *"redeployments of a modified SwapVM contract"* —
jadi pilihan pertama sah. Perlu dipastikan interpretasinya.

### Versi Solidity

Larel pakai `solc 0.8.24`, Aqua dan SwapVM mengunci `0.8.30`.
Perlu naikkan `contracts/foundry.toml`, lalu pastikan 7 kontrak lama masih kompilasi.

### Opcode custom

**Belum diputuskan.** Ini yang membuat proyek dinilai lebih tinggi.
Daftar celah ada di RESOURCES.md bagian 4. Yang paling nyambung dengan Larel:

- **Gate berbasis bukti** — hanya taker yang membawa bukti valid bisa mengeksekusi.
  Nyambung langsung dengan tema privasi Larel. `Whitelist.sol` sudah menyediakan
  polanya, dan Temuan #8 menunjukkan gate yang ada masih cocok-sebagian — ada celah
  nyata untuk diperbaiki.
- **Fee berdasar toksisitas trade** — arah trade relatif oracle.
- **Pricing berdasar saldo dompet maker** — belum ada satu pun instruksi yang membacanya.

### Bentuk posisi maker

Siapa yang menyediakan likuiditas, dan strategi apa yang dijalankan?
Ini pertanyaan produk, belum terjawab.

---

## 7. Rencana bertahap

Setiap tahap harus bisa dijalankan dan diuji sebelum lanjut.

| # | Tahap | Selesai kalau |
|---|---|---|
| 1 | Naikkan solc ke 0.8.30, tambahkan dependency Aqua + SwapVM | `forge build` hijau |
| 2 | Test Foundry pertama: XYC lewat Aqua, tiru `SwapVMAqua.t.sol` | Satu swap berhasil |
| 3 | Router custom + opcode set, tanpa opcode baru | Test tahap 2 masih hijau |
| 4 | `AquaTakerAdapter` — `LarelPool` bisa jadi taker | Swap dari pool berhasil |
| 5 | Hapus `SimpleAMM`, arahkan frontend ke adapter | Mode "Instant" jalan di UI |
| 6 | Opcode custom + testnya | Cabang baru terbukti bekerja |
| 7 | Invariant suite | 7 invariant lolos |
| 8 | Halaman maker di frontend | Bisa buka/tutup posisi dari UI |
| 9 | Deploy + demo transfer onchain | Syarat kualifikasi terpenuhi |

Tahap 1–4 adalah migrasi murni. Tahap 6 ke atas adalah nilai tambah untuk penjurian.

---

## 8. Temuan dari kode yang ada

Hal-hal yang ditemukan saat membaca, yang mempengaruhi rencana.

**#1 — `SimpleAMM` tidak memungut fee sama sekali.**
`amountOut = (reserveOut * amountIn) / (reserveIn + amountIn)` — tidak ada potongan.
Artinya penyedia likuiditas saat ini tidak mendapat apa-apa. Migrasi ke SwapVM
langsung memperbaiki ini lewat `FeeFlatIn`, dan itu perbaikan nyata yang bisa disebut.

**#2 — Merkle tree-nya belum selesai.**
`LarelPool._insert()` memakai `bytes32(0)` sebagai pengganti zero-hash yang seharusnya
dihitung dulu. Komentarnya sendiri menyebut *"using bytes32(0) as a mock"*.
Di luar jalur migrasi, tapi perlu dicatat sebelum demo.

**#3 — Nol test Solidity.**
`contracts/test/` hanya berisi fixture proof. Tidak ada satu pun file `.t.sol`
di seluruh repo. Semua test ada di TypeScript dan Noir.
Ini justru peluang — harness Foundry Aqua/SwapVM sangat bagus dan tinggal diturunkan.

**#4 — `setTeeAddress()` tanpa kontrol akses.**
Ada komentar `// TODO: add access control (onlyOwner)`. Siapa pun bisa mengganti
alamat TEE dan memalsukan hasil settlement. Bukan bagian migrasi, tapi kalau juri
membaca kode, ini terlihat.

**#5 — `MockPoseidon` dan `MockTransferVerifier` masih terpasang di deployment.**
`MockTransferVerifier` selalu mengembalikan true. Perlu dijelaskan atau diganti
sebelum demo.

**#6 — Token mock pakai 7 desimal.**
Warisan dari Stellar. Aqua dan SwapVM tidak mempermasalahkan, tapi perhatikan saat
menghitung angka di test.

**#7 — Tidak ada riwayat git di `main/`.**
Folder ini salinan tanpa `.git`. Syarat kualifikasi #3 mensyaratkan riwayat commit
yang wajar, jadi repo kerja perlu di-init dan di-commit bertahap sejak awal.

---

## 9. Yang belum dikerjakan

- [ ] Putuskan chain (bagian 6)
- [ ] Putuskan opcode custom (bagian 6)
- [ ] Putuskan bentuk posisi maker (bagian 6)
- [ ] Baca `protocol/fce-matcher` lebih dalam — bagaimana TEE dipanggil
- [ ] Baca `frontend/src/lib/real-sdk.ts` — persisnya apa yang dipanggil `swapShielded`
- [ ] Cek apakah `LarelPool` perlu diubah, atau cukup adapter di luarnya
- [ ] Init git di repo kerja
