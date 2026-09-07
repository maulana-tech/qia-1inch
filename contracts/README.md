# Kontrak Iqia

Proyek Foundry. Berisi router SwapVM custom dengan dua opcode buatan sendiri,
adapter taker, token mock untuk faucet, dan skrip demo.

## Isi

| File | Fungsi |
|---|---|
| `src/iqia/IqiaSwapVMRouter.sol` | SwapVM yang di-deploy ulang dengan opcode 22 dan 23. Sekaligus jadi Aqua app |
| `src/iqia/IqiaOpcodes.sol` | Menyisipkan opcode custom ke slot cadangan, dengan penjaga runtime |
| `src/iqia/instructions/ExclusiveFill.sol` | Opcode 22 — hanya alamat yang ditunjuk boleh mengisi |
| `src/iqia/instructions/SolvencyGuard.sol` | Opcode 23 — harga memburuk saat jaminan nyata maker menipis |
| `src/iqia/IqiaAquaTaker.sol` | Adapter taker untuk pihak yang butuh callback |
| `src/MockERC20.sol` | Token uji dengan mint permissionless |
| `script/deploy.sh` | Deploy + kirim posisi pertama. Anvil maupun testnet |
| `script/DemoIqiaDesk.s.sol` | Demo transfer on-chain lewat Aqua + SwapVM |
| `script/fork-demo.sh` | Demo di atas fork Base mainnet, memakai Aqua RESMI |
| `script/DemoOnBaseFork.s.sol` | Isi demo fork tersebut |

## Dua opcode itu

SwapVM menyediakan slot cadangan berisi `_notInstruction` supaya instruksi baru
bisa ditambah tanpa menggeser nomor yang sudah ada — nomor opcode adalah INDEKS
di array, jadi menyisipkan di tengah merusak setiap program yang sudah ada.
`IqiaOpcodes` menempati slot 22 dan 23 dengan penjaga yang gagal keras kalau
versi SwapVM berikutnya ternyata sudah mengisinya.

`SolvencyGuard` adalah yang khas: tidak ada instruksi bawaan SwapVM yang membaca
saldo dompet maker. Ia hanya punya arti di Aqua, sebab di kolam biasa dananya
sudah disetor dan pertanyaannya tidak ada.

## Urutan instruksi mengikat

`solvencyGuard` harus SEBELUM `decay` dan `xycConcentrate`; `flatFeeIn` harus
SESUDAH `xycConcentrate`. Salah urutan tidak menimbulkan error — posisinya tetap
melayani swap, hanya keuntungan strateginya yang hilang. Dikunci di
`test/Strategies.t.sol`.

## Desimal

Token mock memakai desimal warisan aplikasi asal dan tidak selalu cocok dengan
apa yang tertulis di registry frontend. Apa pun yang memindahkan token membaca
`decimals()` dari kontraknya, bukan dari daftar.

## Perintah

```bash
forge build
forge test                      # 37 test

# deploy + kirim posisi, anvil
./script/deploy.sh

# deploy + kirim posisi, testnet
RPC=https://sepolia.base.org DESK_KEY=0x<kunci-privat> ./script/deploy.sh

# demo di atas Aqua RESMI lewat fork Base mainnet
anvil --fork-url https://mainnet.base.org --port 8546 --chain-id 8453 &
./script/fork-demo.sh
```
