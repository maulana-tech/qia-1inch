# Status migrasi → Aqua / SwapVM

Catatan berjalan: apa yang sudah dipindahkan, apa yang tersisa, dan alasan
di balik keputusannya.

Rujukan teknis Aqua/SwapVM ada di [RESOURCES.md](./RESOURCES.md).

---

## Titik berangkat

Aplikasi ini bermula sebagai lapisan trading rahasia di chain lain. Saldo
disembunyikan di balik *note commitment* dalam Merkle tree, dan order
dicocokkan di dalam enclave tepercaya sehingga operator pun tidak melihat
buku order.

Likuiditasnya berasal dari `SimpleAMM` — klon Uniswap V2 setebal 216 baris
**tanpa fee sama sekali**.

---

## Ketegangan inti

Ini yang membuat migrasi tidak bisa dilakukan secara naif.

**Kolam terlindung menitipkan dana. Aqua justru menolak menitipkan dana.**

| | Kolam terlindung | Aqua |
|---|---|---|
| Di mana token berada | Di dalam kontrak `IqiaPool` | Tetap di dompet pemilik |
| Cara masuk | `deposit()` — token benar-benar pindah | `ship()` — hanya catatan izin |
| Kenapa begitu | Saldo harus tersembunyi. Saldo di dompet publik itu... publik | Efisiensi modal. Modal tidak terkunci |

Kedua model ini bertabrakan langsung. Tidak mungkin punya saldo rahasia yang
sekaligus masih terlihat di dompetmu.

### Pemecahannya

Keduanya berada di **dua sisi berbeda dari transaksi yang sama**.

- **Sisi taker** (yang melakukan swap) → tetap kolam terlindung. Rahasia.
- **Sisi maker** (penyedia likuiditas) → Aqua. Dananya di dompet, tidak terkunci.

Jadi yang diganti bukan kolamnya, tapi **`SimpleAMM`**.

> Dark pool yang likuiditasnya datang dari dompet market maker yang tidak
> pernah terkunci. Pembeli tersembunyi. Penjual tidak kehilangan kendali
> atas dananya.

---

## Arsitektur target

```
Pengguna
   │ deposit — token pindah ke kolam
   ▼
IqiaPool ──── swap ────► Router SwapVM custom
   │                          │ jalankan program bytecode
   │                          ▼
   │                        Aqua ──pull/push──► dompet market maker
   │                                             token tidak pernah terkunci
   └──── order tersembunyi ────► matcher off-chain ────► penyelesaian lewat SwapVM
```

`IqiaPool` berperan sebagai **taker**. Router SwapVM custom sekaligus menjadi
**Aqua app** — di mode Aqua, argumen `app` pada `aqua.ship()` adalah alamat
router. Satu kontrak memenuhi dua syarat.

---

## Yang sudah selesai

| Tahap | Hasil |
|---|---|
| ✅ Ganti nama aplikasi | 337 kemunculan di 87 file, plus 10 file/folder. Termasuk nama lama yang tertinggal di sirkuit dan SDK |
| ✅ Buang lapisan enclave | 82 file: layanan pencocokan ber-Docker, pengirim instruksi, ABI-nya |
| ✅ Pindah chain | Target sekarang Base Sepolia. Escrow lintas-chain, sisi L1-nya, dan dependency mati dari chain lama semuanya dibuang |

Ketiganya terverifikasi: SDK 41 test lolos, matcher 25 test lolos, frontend
typecheck bersih, sirkuit Noir 5 test lolos.

### Bug yang ikut terperbaiki

- **`.gitignore` menyebut layout lama** (`circuits/` di root, padahal
  `protocol/circuits/`), sehingga 45 artefak build ikut ter-track
- **`.gitmodules` menunjuk path yang tidak ada** (`bridge/l1/lib/forge-std`)
- **Validasi alamat memakai pola chain yang salah** — regex `^G[A-Z2-7]{55}$`
  dipakai di jalur withdraw, artinya setiap alamat EVM yang sah ditolak
- **`faucetMint` memakai `PublicClient` generik viem** — Base adalah chain
  OP-stack dengan varian transaksi `deposit`, sehingga tipenya tidak menyatu
- **Dependency yang tidak pernah di-import** masih terdaftar di paket matcher

---

## Yang tersisa

| Tahap | Selesai kalau |
|---|---|
| 🚧 Pasang Foundry | `forge` tersedia. **Memblokir semua tahap di bawah** |
| ⬜ Vendor Aqua + SwapVM ke `contracts/lib/` | `forge build` hijau |
| ⬜ Naikkan solc 0.8.24 → 0.8.30 | 6 kontrak lama masih kompilasi |
| ⬜ Test Foundry pertama: satu swap lewat Aqua | Meniru `SwapVMAqua.t.sol` |
| ⬜ Router SwapVM custom + opcode set | Test sebelumnya masih hijau |
| ⬜ Adapter taker — `IqiaPool` bisa jadi taker | Swap dari kolam berhasil |
| ⬜ Hapus `SimpleAMM`, arahkan frontend | Mode swap jalan di UI |
| ⬜ Opcode custom + testnya | Cabang baru terbukti bekerja |
| ⬜ Suite invariant | 7 invariant lolos |
| ⬜ Deploy + demo transfer onchain | Syarat kualifikasi terpenuhi |

---

## Keputusan

### Chain — sudah diputuskan: **Base**

Base Sepolia untuk aplikasi, Base mainnet lewat fork lokal saat menguji
terhadap SwapVM resmi. Base dipilih karena SwapVM sudah dideploy di sana
(`0x111111338c5091E8440b67B168bAe16a668AC0De`), gas murah, dan dukungan
wagmi/viem bagus.

Base Sepolia tidak punya SwapVM resmi, jadi untuk testnet router custom
dideploy sendiri. Syarat hackathon mengizinkan redeploy SwapVM yang
dimodifikasi.

### Opcode custom — belum diputuskan

Ini yang membuat proyek dinilai lebih tinggi. Daftar celah ada di
[RESOURCES.md](./RESOURCES.md) bagian 4. Yang paling nyambung dengan tema
privasi aplikasi ini:

- **Gate berbasis bukti** — hanya taker yang membawa bukti valid bisa
  mengeksekusi. `Whitelist.sol` sudah menyediakan polanya, dan Temuan #8
  menunjukkan gate yang ada masih cocok-sebagian, jadi ada celah nyata
  untuk diperbaiki.
- **Fee berdasar toksisitas trade** — arah trade relatif oracle.
- **Pricing berdasar saldo dompet maker** — belum ada satu pun instruksi
  yang membacanya.

### Bentuk posisi maker — belum diputuskan

Siapa yang menyediakan likuiditas, dan strategi apa yang dia jalankan.
Ini pertanyaan produk, dan menentukan apakah proyek memenuhi *"sophisticated
DeFi position"* atau sekadar jadi AMM biasa di atas Aqua.

---

## Catatan yang masih berlaku

**`SimpleAMM` tidak memungut fee sama sekali.**
`amountOut = (reserveOut * amountIn) / (reserveIn + amountIn)` — tidak ada
potongan. Penyedia likuiditasnya tidak mendapat apa-apa. Pindah ke SwapVM
langsung memperbaiki ini lewat `FeeFlatIn`.

**Merkle tree-nya belum selesai.**
`IqiaPool._insert()` memakai `bytes32(0)` sebagai pengganti zero-hash yang
seharusnya dihitung dulu. Komentarnya sendiri menyebut *"using bytes32(0)
as a mock"*.

**Nol test Solidity.**
`contracts/test/` hanya berisi fixture proof. Semua test ada di TypeScript
dan Noir. Ini peluang — harness Foundry Aqua/SwapVM tinggal diturunkan.

**`setTeeAddress()` tanpa kontrol akses.**
Ada komentar `// TODO: add access control (onlyOwner)`. Jalurnya sudah mati,
tapi kalau juri membaca kode, ini terlihat.

**Verifier tiruan masih terpasang.**
`MockTransferVerifier` selalu mengembalikan true. Perlu dijelaskan atau
diganti sebelum demo.

**Token mock pakai 7 desimal.**
Disengaja: sirkuit memaksakan `assert_64` pada besaran, dan 18 desimal
membuat jumlah wajar melampaui rentang 64-bit.
