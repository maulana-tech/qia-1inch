# Resources — 1inch Aqua / SwapVM

Kumpulan tautan, temuan, dan catatan teknis untuk hackathon Aqua.
Dokumen ini bertahan lintas sesi. Kalau ada fakta baru yang diverifikasi dari kode, tambahkan ke bagian **Temuan**.

---

## 1. Syarat hackathon

**Track:** 💧 Build an Aqua App — $5.000 (1st $2.500 / 2nd $1.500 / 3rd $1.000)

**Tugas:** bikin Aqua app custom yang mengimplementasikan sebuah *sophisticated DeFi position*.
Boleh memodifikasi opcode SwapVM dan mendefinisikan instruksi sendiri.

**Syarat lolos:**

1. Wajib pakai kontrak resmi Aqua/SwapVM — redeploy SwapVM yang dimodifikasi diperbolehkan
2. Demo harus menunjukkan eksekusi transfer token onchain — **local fork boleh**
3. Riwayat commit git yang wajar — bukan satu commit besar di hari terakhir

**Kriteria pembeda:** proyek yang memakai SwapVM dinilai lebih tinggi.

---

## 2. Repo resmi

```bash
git clone https://github.com/1inch/aqua.git
git clone https://github.com/1inch/swap-vm.git
git clone https://github.com/1inch/aqua-app-template.git
```

**Tidak bisa lewat npm.** README kedua repo menulis `npm install @1inch/swap-vm`,
tapi `@1inch/aqua` dan `@1inch/swap-vm` dua-duanya mengembalikan 404 di registry
publik. Harus di-vendor dari git — lihat Temuan #9.

| Repo | Isi | Build tool |
|---|---|---|
| [1inch/aqua](https://github.com/1inch/aqua) | Registry saldo virtual. `Aqua.sol`, `AquaApp.sol`, contoh `XYCSwap` | Foundry |
| [1inch/swap-vm](https://github.com/1inch/swap-vm) | VM bytecode untuk strategi swap. 23 file instruksi, 6 router | Foundry |
| [1inch/aqua-app-template](https://github.com/1inch/aqua-app-template) | Kerangka resmi + 4 diagram PNG alur | **Hardhat** |
| [1inch/sdks](https://github.com/1inch/sdks/tree/master/typescript/aqua) | SDK TypeScript Aqua + SwapVM | — |

Template resminya Hardhat, tapi `CoreInvariants` dan test base yang berguna ada di repo Foundry.

---

## 3. File yang wajib dibaca

### Aqua

| Path | Baris | Kenapa penting |
|---|---|---|
| `aqua/src/Aqua.sol` | ~85 | Inti protokol. Baca `ship`/`dock`/`pull`/`push` — pendek dan padat |
| `aqua/examples/apps/XYCSwap.sol` | 184 | Satu-satunya contoh Aqua app resmi tanpa SwapVM |
| `aqua/examples/test/XYCSwap.t.sol` | 718 | Alur ship/dock/swap lengkap |
| `aqua/README.md` | — | Penjelasan konsep saldo virtual |
| `aqua/docs/whitepaper-aqua-1.0.pdf` | — | Belum dibaca |

### SwapVM

| Path | Baris | Kenapa penting |
|---|---|---|
| `swap-vm/test/base/AquaStrategyBuilders.sol` | 159 | **Paling berguna.** Harness Aqua+SwapVM siap turun |
| `swap-vm/test/base/AquaSwapVMTest.sol` | 235 | Eksekusi swap |
| `swap-vm/test/SwapVMAqua.t.sol` | 133 | Contoh Aqua+SwapVM paling sederhana. Mulai dari sini |
| `swap-vm/src/routers/AquaSwapVMRouter.sol` | 30 | Template router custom. Cuma 30 baris |
| `swap-vm/src/opcodes/AquaOpcodes.sol` | 46 | Daftar opcode mode Aqua |
| `swap-vm/src/instructions/Jumps.sol` | ~180 | Template opcode sederhana (`sizeOf`/`build`/`parse`/`exec`) |
| `swap-vm/src/instructions/MinRate.sol` | 119 | Template opcode **wrapper** (`runLoop`). Dua opcode dalam 119 baris |
| `swap-vm/src/strategies/Strategies.sol` | 104 | Cara 1inch sendiri membungkus strategi "aman" |
| `swap-vm/docs/PROGRAMS.md` | 234 | Katalog pola program per jenis strategi |
| `swap-vm/test/RunLoop.t.sol` | 362 | Pemilihan cabang strategi |
| `swap-vm/test/mocks/BestRouteSelector.sol` | 124 | Contoh `Extruction` |
| `swap-vm/test/PrivateOrder.t.sol` | — | Contoh order privat / whitelist |
| `swap-vm/docs/whitepaper-swap-vm-1.0.pdf` | — | Belum dibaca |

---

## 4. Inventaris instruksi SwapVM

23 file di `swap-vm/src/instructions/`. **Jangan bangun ulang yang sudah ada.**

| File | Fungsi | Setara dengan |
|---|---|---|
| `Balances.sol` | Static (rate tetap) & Dynamic (reserve AMM) | — |
| `LimitSwap.sol` | Limit order, penuh atau parsial | 1inch Limit Order |
| `XYCSwap.sol` | Constant product `x*y=k` | Uniswap V2 |
| `XYCConcentrate.sol` | Likuiditas terkonsentrasi dalam range | Uniswap V3 |
| `PeggedSwap.sol` | Kurva aset berpasangan | Curve |
| `DutchAuction.sol` | Harga turun bertahap | Fusion |
| `TWAPSwap.sol` | Eksekusi rata-rata terbobot waktu | TWAP / DCA |
| `Decay.sol` | Saldo virtual meluruh, anti-MEV | Mooniswap |
| `FeeFlat.sol` | Fee tetap, sisi in atau out | — |
| `FeeProgressive.sol` | Fee naik sesuai ukuran trade | — |
| `FeeProtocol.sol` | Fee protokol, statis & dinamis | — |
| `BaseFeeAdjuster.sol` | Harga ikut harga gas | — |
| `OraclePriceAdjuster.sol` | Harga ikut oracle eksternal | DODO PMM |
| `MinRate.sol` | Jaminan rate minimum (require & adjust) | slippage guard |
| `Invalidators.sol` | Anti-replay, pelacakan partial fill | — |
| `Jumps.sol` | `Jump`, `JumpIfDirection`, `JumpIfTokenIn/Out` | — |
| `Controls.sol` | `Stop`, `Revert`, `Deadline`, `Salt` | — |
| `TokenValidators.sol` | Gate berdasar saldo token / NFT taker | akses terbatas |
| `Whitelist.sol` | `PrivateOrder` — gate berdasar alamat taker | dark pool sederhana |
| `SeriesEpochManager.sol` | Pembatalan order massal per epoch | — |
| `PiecewiseLinearScale.sol` | Skala linear bertahap | — |
| `Extruction.sol` | Panggilan logika eksternal | — |
| `Debug.sol` | Utilitas debug | — |

### Celah — belum ada instruksinya

Kandidat opcode custom. Ini yang akan dinilai sebagai kontribusi.

| Fitur | Catatan |
|---|---|
| Percabangan berdasar band oracle | `OraclePriceAdjuster` hanya menggeser harga, tidak bercabang |
| Fee dinamis mengikuti volatilitas | Yang ada hanya fee by ukuran & by harga gas |
| Fee berdasar arah trade relatif oracle (toxicity) | Landasan riset LVR ada |
| Stop loss / trailing stop | Tidak ada sama sekali |
| Inventory skew | Harga miring mengikuti ketimpangan stok |
| Pricing berdasar saldo wallet maker | **Tidak ada yang membaca saldo maker.** Lihat Temuan #3 |

---

## 5. Deployment

**SwapVM:** `0x111111338c5091E8440b67B168bAe16a668AC0De`

Ethereum, Base, Optimism, Polygon, Arbitrum, Avalanche, BSC, Linea, Sonic,
Unichain, Gnosis, zkSync, Cronos, Monad, HyperEVM.

**Aqua:** alamat resmi **belum ditemukan**. `config/constants.json` di kedua repo
hanya berisi alamat nol untuk chain 31337. Test harness memakai `new Aqua()`.
Untuk demo fork, deploy Aqua sendiri — tetap sah karena memakai kontrak resmi.

Panduan: `aqua/DEPLOY.md`, `swap-vm/DEPLOY.md`, `swap-vm/TESTING.md`.

---

## 6. Temuan — sudah diverifikasi dari kode

Jangan percaya README sepenuhnya. Semua di bawah ini dibaca langsung dari sumber.

**#1 — `ship()` tidak mengecek saldo wallet.**
`Aqua.sol` hanya mencatat allowance virtual. Token baru bergerak di `pull()` lewat
`safeTransferFrom(maker, to, amount)`. Artinya satu wallet berisi 10 WETH **bisa**
menjanjikan 10 WETH ke tiga strategi sekaligus. Ini fitur, bukan bug — tapi tidak ada penjaganya.

**#2 — `dock()` mengunci strategyHash selamanya.**
Setelah dock, `tokensCount = 0xff`. `ship()` menolak hash yang sudah dipakai.
Jadi setiap perubahan parameter wajib ganti salt → hash baru. Itu sebabnya opcode
`Salt` muncul di test builder.

**#3 — Tidak ada instruksi yang membaca saldo maker.**
`grep balanceOf src/` hanya menemukan pemanggilan pada `ctx.query.taker` dan `tx.origin`
di `TokenValidators.sol`. Tidak ada yang menentukan harga berdasarkan saldo asli maker.

**#4 — `AquaOpcodes.sol` meng-import `Stop` dan `Revert` tapi tidak mendaftarkannya.**
Dispatcher-nya hanya menangani 16 opcode. `Stop`, `Revert`, dan `JumpIfDirection`
ikut di-import tapi tidak bisa dipanggil. Opcode set custom harus menambahkannya sendiri.

**#5 — Pola wrapper `runLoop()` itu idiomatik.**
Dipakai 9 instruksi: `FeeFlat`, `FeeProgressive`, `FeeProtocol`, `Decay`, `MinRate`,
`TWAPSwap`, `Invalidators`, `Balances`, `Debug`. Sebuah opcode bisa menjalankan sisa
program lalu memproses hasilnya. `MinRate.sol` memuat dua opcode dalam 119 baris.

**#6 — Branch `main` berbeda dari rilis. Pakai tag, jangan `main`.**
Di branch `main`, `MakerTraitsLib.Args` punya field `tokenA`/`tokenB` dan
`TakerTraitsLib.Args` punya `isAToB` serta `allowPartialFill`. **Di rilis
v1.0.2 ketiganya tidak ada**, dan bentuknya justru sama dengan README.

Proyek ini dipatok ke `aqua v1.0.0` dan `swap-vm v1.0.2`. Kalau membaca contoh
dari branch `main`, sesuaikan dulu — struct-nya tidak cocok.

**#7 — Di mode Aqua, `app` = alamat router SwapVM.**
`aqua.ship(address(swapVM), abi.encode(order), tokens, amounts)`.
Jadi router custom kita **sekaligus** menjadi Aqua app-nya. Satu kontrak, dua syarat terpenuhi.
`strategyHash` = `keccak256(abi.encode(order))` dan harus sama dengan `swapVM.hash(order)`.

**#8 — Gate `PrivateOrder` cocok sebagian alamat.**
Di `test/PrivateOrder.t.sol`, `COLLISION_TAKER` ikut lolos. Whitelist hemat gas,
bukan pencocokan presisi.

**#9 — Paket npm-nya tidak ada.**
README kedua repo menginstruksikan `npm install @1inch/swap-vm`, dan ada badge npm
di bagian atas. Kenyataannya `@1inch/aqua` dan `@1inch/swap-vm` sama-sama 404 di
registry publik. Satu-satunya cara memakainya adalah vendor dari git, dan karena
keduanya proyek Foundry dengan remapping sendiri, Foundry menjadi wajib.

**#10 — Dependensinya dicari di `node_modules/`, bukan `lib/`.**
`remappings.txt` di kedua repo menunjuk `node_modules/@openzeppelin/contracts/`
dan `node_modules/@1inch/solidity-utils/`. Jadi meski dipasang lewat
`forge install`, paket npm-nya tetap harus ada. Versi yang dipatok keduanya sama:
`@openzeppelin/contracts` 5.4.0 dan `@1inch/solidity-utils` 6.9.7.

**#11 — `via_ir` wajib, tapi merusak verifier hasil-generate Noir.**
Tanpa `via_ir` compiler kehabisan stack saat mengompilasi SwapVM. Dengan `via_ir`
justru verifier UltraHonk yang pecah, di sekitar `PAIRING_POINTS_SIZE`. Jawabannya
`compilation_restrictions` per-file di `foundry.toml`: verifier tetap di pipeline
lama, sisanya via_ir.

**#12 — Program dirakit lewat utilitas test, bukan API `src/`.**
`ProgramBuilder` ada di `test/utils/ProgramBuilder.sol`, dan opcode dirujuk lewat
pointer fungsi (`p.build(XYCSwap._xycSwapXD)`) yang dicari indeksnya di array
`_opcodes()`. Artinya kontrak test harus mewarisi `AquaOpcodesDebug` untuk
mendapat `_opcodes()`.

---

## 7. Invariant wajib

Tujuh invariant yang harus dipertahankan instruksi apa pun (`swap-vm/README.md`):

1. Simetri exact-in / exact-out
2. Profil aditivitas — idealnya subaditif, memecah order tidak boleh menguntungkan
3. Konsistensi quote dengan swap
4. Monotonisitas harga — trade lebih besar tidak boleh dapat harga lebih baik
5. Pembulatan berpihak pada maker
6. Kecukupan saldo
7. Liveness — strategi tetap hidup saat satu sisi terkuras

Repo menyediakan base contract siap pakai:

```solidity
import { CoreInvariants } from "test/invariants/CoreInvariants.t.sol";
assertAllInvariantsWithConfig(swapVM, order, tokenIn, tokenOut, config);
```

Referensi: `test/invariants/DutchAuctionLimitSwapInvariants.t.sol` (1D),
`test/invariants/ConcentrateXYCInvariants.t.sol` (2D),
`test/invariants/ExampleInvariantUsage.t.sol`.

Ini sering dilewatkan peserta lain. Murah dipasang, langsung terlihat serius.

---

## 8. Referensi luar — inspirasi fitur

### Manajemen likuiditas otomatis

- [Arrakis Finance Docs](https://docs.arrakis.finance/) — rebalance otomatis, fee dinamis mengikuti kondisi pasar
- [Gamma Strategies](https://consensys.io/blog/gamma-strategies-an-innovative-solution-to-the-challenge-of-liquidity-management) — rebalance terpicu pergerakan harga sekian persen
- [Uniswap ALM Analysis — Gauntlet](https://www.gauntlet.xyz/resources/uniswap-alm-analysis) — perbandingan strategi antar ALM
- [Overview of LP Vaults for Uniswap v3](https://paragraph.com/@orange-finance/an-overview-of-liquidity-management-vaults-for-uniswap-v3)

### Jenis order lanjutan

- [Advanced Order Types — Definitive](https://www.definitive.fi/blog/advanced-order-types-crypto) — limit, stop loss, TWAP, bracket, trailing
- [Orbs — Agentic Execution for DeFi](https://alearesearch.substack.com/p/orbs-agentic-execution-for-defi)

### Fee dinamis & LVR

- [Optimal Dynamic Fees in AMMs — arXiv 2506.02869](https://arxiv.org/html/2506.02869v1)
- [Optimal Dynamic Fees: Stochastic Control Approach to LVR — arXiv 2606.21769](https://arxiv.org/html/2606.21769)
- [Optimal Fees for Liquidity Provision — arXiv 2508.08152](https://arxiv.org/pdf/2508.08152)
- [Dynamic Fees for AMMs — Atis E](https://atise.medium.com/dynamic-fees-for-automated-market-makers-liquidity-volatility-and-collected-fees-db211da18d0d)

### Berita

- [1inch meluncurkan Aqua — The Block](https://www.theblock.co/press-releases/379041/1inch-launches-aqua-the-first-shared-liquidity-protocol-now-available-for-developers)
- [ETHGlobal Buenos Aires — hadiah 1inch](https://ethglobal.com/events/buenosaires/prizes/1inch)

---

## 9. Yang belum dikerjakan

- [ ] Baca kedua whitepaper PDF
- [ ] Cari alamat Aqua yang sudah live di mainnet
- [ ] Baca SDK TypeScript di `1inch/sdks`
- [ ] Baca `swap-vm/TESTING.md`
- [ ] Putuskan: Foundry atau Hardhat
- [ ] Putuskan konsep aplikasi
