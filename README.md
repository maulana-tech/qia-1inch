<p align="center">
  <img src="frontend/src/assets/iqia-logo.png" alt="Iqia" width="120" />
</p>

<h1 align="center">Iqia</h1>

<p align="center">
  A market-making desk on 1inch Aqua, where liquidity never leaves the maker's
  wallet and the pricing strategy is a SwapVM program you can read before you ship it.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Base-Sepolia-1b1b1b" alt="Base Sepolia" />
  <img src="https://img.shields.io/badge/1inch-Aqua%20%C2%B7%20SwapVM-1b1b1b" alt="Aqua / SwapVM" />
  <img src="https://img.shields.io/badge/License-MIT-1b1b1b" alt="MIT" />
</p>

---

## Status

Aplikasi ini sebelumnya berjalan di chain lain sebagai dark pool ZK. Lapisan itu
sudah dibuang seluruhnya — sirkuit, kolam, verifier, dan SDK-nya — dan yang
tersisa adalah meja market making di atas **1inch Aqua + SwapVM**.

| Bagian | Keadaan |
|---|---|
| Likuiditas lewat Aqua/SwapVM | ✅ Jalan, terbukti on-chain |
| Dua opcode SwapVM custom | ✅ 37 test |
| Empat strategi + wizard | ✅ Jalan, byte-nya terlihat sebelum dikirim |
| Swap dari UI | ✅ Jalan, lewat `@iqia/swapvm` |
| Baca likuiditas nyata di Base | ✅ Jalan, dari router SwapVM resmi |

Peta migrasinya di [`docs/migrasi.md`](docs/migrasi.md).
Rujukan teknis Aqua/SwapVM di [`docs/RESOURCES.md`](docs/RESOURCES.md).

---

## Masalah

Untuk menyediakan likuiditas on-chain, dananya harus dititipkan ke kolam lebih
dulu. Modal terkunci di kontrak, tidak bisa dipakai untuk hal lain, dan
menariknya kembali butuh transaksi tersendiri. Itu ongkos yang ditagih setiap
AMM sebelum kamu memperoleh satu sen fee pun.

Buat pemilik dompet biasa, ongkos itu terlalu mahal untuk imbalan yang tidak
seberapa. Jadi mereka tidak ikut, dan likuiditas terkumpul di segelintir pihak.

## Jawaban Iqia

**Token tidak pernah pindah dari dompetmu.**

Aqua mencatat *izin*, bukan setoran. Membuka posisi tidak memindahkan apa pun —
bandingkan saldo dompet sebelum dan sesudah, angkanya sama persis. Token bergerak
tepat sekali, pada detik sebuah swap terjadi, langsung dari maker ke taker.
Modal yang sama bisa menopang beberapa strategi sekaligus.

**Strateginya program, bukan label.** Aturan hargamu dijalankan sebagai bytecode
di dalam SwapVM. Iqia mendeploy ulang SwapVM dengan dua instruksi buatan sendiri:
satu membatasi siapa yang boleh mengisi, satu lagi menggerakkan harga saat
jaminan nyata maker menipis — memburuk bertahap alih-alih gagal mentah.

Instruksi kedua itu hanya punya arti di Aqua. Di kolam biasa pertanyaannya tidak
ada, sebab dananya sudah disetor.

---

## Arsitektur

```
Maker                              Taker
   │ ship() — nol transfer            │ swap
   ▼                                  ▼
Aqua  (registry izin)  ◄──── Router SwapVM custom
   │                          program bytecode dijalankan on-chain
   └── pull / push ──►  token pindah LANGSUNG dari dompet maker
                        ke dompet taker, tepat saat swap terjadi
```

Di mode Aqua, argumen `app` pada `aqua.ship()` adalah alamat router SwapVM.
Jadi router custom kita **sekaligus** menjadi Aqua app-nya — satu kontrak.

---

## Struktur repo

```
contracts/          Kontrak Solidity (Foundry)
  src/iqia/IqiaSwapVMRouter     SwapVM + dua opcode custom (Aqua app)
  src/TransferProcessor.sol     Transfer berbasis ZK
  src/iqia/IqiaSwapVMRouter     Router SwapVM custom, sekaligus Aqua app
  src/iqia/IqiaAquaTaker        Adapter taker untuk SwapVM
  src/iqia/instructions/        Dua opcode custom
protocol/
  swapvm/                  Perakit program SwapVM + pengkode traits
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
| Node.js | 24.x | Perakit program dan frontend |
| pnpm | 10.x | Workspace monorepo |
| Foundry | 1.8.x | Kontrak, test, skrip deploy |

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
tanpanya compiler kehabisan stack saat mengompilasi SwapVM.

### 3. Verifikasi

```bash
cd contracts && forge test && cd ..     # 37 test
pnpm --filter @iqia/swapvm test         # 15 test
pnpm --filter frontend typecheck
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
`
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

## Satu kantong modal, banyak pasar

Ini yang tidak bisa dilakukan AMM mana pun, dan alasan utama aplikasi ini ada.

`ship()` tidak memindahkan token **dan tidak memeriksa saldo**. Jadi 10 WETH yang
sama bisa terdaftar sebagai likuiditas di beberapa pasar sekaligus. Di Uniswap,
10 WETH-mu ada di SATU pool.

Yang membuatnya tidak sembrono: `SolvencyGuard` membaca dompet yang sama di
setiap pasar. Begitu satu pasar menghabiskan sebagian modal bersama, pasar LAIN
ikut memburuk harganya — tanpa keeper, tanpa oracle, tanpa transaksi yang
menyentuh mereka.

```bash
anvil &
cd contracts && ./script/shared-capital.sh
```

Keluarannya, diukur di rantai:

```
WETH nyata di dompet      10.0
WETH terdaftar (3 pasar)  30.0        efisiensi modal 3x

kutipan SEBELUM ada yang menukar
  pasar B (WETH/DAI)      0.276968
  pasar C (WETH/WBTC)     0.276968

sesudah satu swap di pasar A, tanpa menyentuh B dan C
  WETH tersisa            8.144
  pasar B jadi            0.274468
  pasar C jadi            0.274468
```

Dua pasar yang tidak disentuh siapa pun ikut bergerak.

Modal bersama tidak dibagi rata — ia **direbut**. Penukar yang datang belakangan
membayar lebih mahal karena jaminannya sudah menipis, dan swap yang terlalu besar
tetap gagal. Batas kerasnya ada; yang berubah cuma cara ia diberitahukan.

Halaman `/desk` menampilkan ini secara langsung: efisiensi modal, kutipan hidup
tiap pasar, dan tombol muat ulang untuk melihatnya bergerak setelah ada swap.

Diukur juga di `contracts/test/SharedCapital.t.sol`.

---

## Demo di atas fork Base mainnet — kontrak Aqua RESMI

Ini cara yang dipakai untuk demo, dan ia menjawab dua syarat kualifikasi
sekaligus:

> Official Aqua/SwapVM contracts must be used (redeployments of a modified
> SwapVM contract is allowed)
>
> Onchain execution of token transfers should be presented during the final demo
> (**local forks are ok**)

Aqua ter-deploy di 16 jaringan dan **semuanya mainnet** — tidak ada satu pun
testnet. Di Base Sepolia kita terpaksa men-deploy Aqua sendiri, padahal kurung
syaratnya cuma mengizinkan **SwapVM** yang di-deploy ulang, bukan Aqua. Fork
memberi kontrak resmi yang asli tanpa uang sungguhan, dan syaratnya menyebutnya
secara eksplisit.

```bash
# 1. fork Base mainnet
anvil --fork-url https://mainnet.base.org --port 8546 --chain-id 8453

# 2. danai, deploy router, kirim posisi, dan tukar
cd contracts && ./script/fork-demo.sh

# 3. arahkan frontend ke fork
cp frontend/.env.fork frontend/.env.local
pnpm --filter frontend dev
```

Yang dipakai:

| | |
|---|---|
| Aqua | `0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a` — kontrak RESMI, tidak di-deploy ulang |
| Router | `IqiaSwapVMRouter` — SwapVM yang diperluas opcode 22 dan 23 |
| Token | WETH dan USDC Base yang asli, bukan mock |

`fork-demo.sh` menulis `frontend/.env.fork` sendiri. Router-nya di-deploy ulang
tiap kali skrip jalan, jadi alamat yang ditulis tangan akan basi tanpa gejala
apa pun selain halaman market yang kosong.

Keluarannya menegaskan yang penting lewat `require`, bukan lewat cetakan:
`ship()` tidak memindahkan token sepeser pun, swap memindahkannya langsung dari
**dompet** maker, dan Aqua tidak pernah menahan token.

---

## Melihat likuiditas nyata di Base

Halaman Markets juga membaca posisi di router SwapVM resmi, tempat market maker
sungguhan berada. Ini murni pembacaan — tanpa dompet, tanpa transaksi, tanpa
biaya.

```bash
cp frontend/.env.base.example frontend/.env.local
pnpm --filter frontend dev
```

RPC publik Base menolak `eth_getLogs` di atas 10.000 blok, jadi sapuannya
dipotong dan jendelanya dibatasi lewat `VITE_MARKETS_LOOKBACK_BLOCKS`. Dengan
RPC berbayar, naikkan angkanya.

---

## Deploy ke testnet

Ini jalur utamanya. Satu perintah, satu dompet.

```bash
cd contracts
RPC=https://sepolia.base.org DESK_KEY=0x<kunci-privat> ./script/deploy.sh
```

Yang dibutuhkan cuma ETH Base Sepolia di dompet itu — ambil dari faucet mana
pun. Skripnya men-deploy Aqua, token uji, router, dan adapter; mengirim posisi
pertama; menjalankan satu swap sungguhan; lalu menulis
`frontend/.env.84532` sendiri.

```bash
cp frontend/.env.84532 frontend/.env.local
pnpm --filter frontend dev
```

Perintah yang sama bekerja di anvil tanpa argumen apa pun:

```bash
anvil &
cd contracts && ./script/deploy.sh
```

Dua hal yang perlu diketahui:

**Di Base Sepolia tidak ada Aqua maupun SwapVM resmi** — keduanya di-deploy
sendiri. Untuk demo yang memakai kontrak Aqua resmi, pakai jalur fork di atas.

**Satu dompet mengerjakan dua peran.** Kalau `MAKER_KEY` tidak diisi terpisah,
maker dan meja jadi akun yang sama, dan WETH yang keluar langsung kembali ke
dompet itu juga. Yang dibuktikan tetap sama — token benar-benar berpindah dan
berpindahnya dari dompet, bukan dari kontrak — hanya selisih akhirnya nol.
Isi `MAKER_KEY` dengan dompet kedua yang juga berisi ETH kalau mau melihat
perpindahan antar dua pihak.

---

## Kalau ada yang tidak jalan

**Market muncul tapi saldonya 0 dan simbolnya berupa alamat.**
Pembacaan kontraknya gagal, bukan likuiditasnya habis — halamannya sekarang
mengatakan itu apa adanya. Penyebab paling sering: **Multicall3 tidak ada** di
rantai yang dipakai. viem memakainya untuk rantai yang definisinya menyatakan
ada (Base, Base Sepolia), jadi anvil lokal yang menyamar sebagai Base Sepolia
akan gagal seluruh pembacaannya. Salin bytecode-nya ke alamat kanonik:

```bash
cast rpc anvil_setCode 0xcA11bde05977b3631167028862bE2a173976CA11 \
  "$(cast code 0xcA11bde05977b3631167028862bE2a173976CA11 --rpc-url https://mainnet.base.org)" \
  --rpc-url http://127.0.0.1:8545
```

Base Sepolia dan Base yang sungguhan sudah punya Multicall3, jadi ini hanya
soal emulasi lokal.


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

**Desimal.** Angka desimal di `lib/tokens.ts` warisan aplikasi asal dan tidak
selalu cocok dengan mock yang ter-deploy. Apa pun yang memindahkan token membaca
`decimals()` dari kontraknya lewat `tokenDecimals()`, bukan dari daftar itu.

**Urutan instruksi mengikat.** `solvencyGuard` harus mendahului `decay` dan
`xycConcentrate`, dan `flatFeeIn` harus menyusul `xycConcentrate`. Salah urutan
tidak menimbulkan error apa pun — posisinya tetap melayani swap, hanya
keuntungan strateginya yang hilang. Dikunci di `contracts/test/Strategies.t.sol`.

---

## Lisensi

MIT. Lihat [LICENSE](LICENSE).
