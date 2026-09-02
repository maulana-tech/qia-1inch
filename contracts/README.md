# Kontrak Iqia

Proyek Foundry. Berisi kolam ZK, verifier hasil-generate Noir, pemroses transfer
privat, dan token mock untuk faucet.

## Isi

| File | Fungsi |
|---|---|
| `src/IqiaPool.sol` | Kolam terlindung. Deposit, withdraw, Merkle tree |
| `src/TransferProcessor.sol` | Transfer privat berbasis bukti ZK |
| `src/HonkVerifier.sol` | Verifier UltraHonk, hasil generate Noir |
| `src/TransferVerifier.sol` | Verifier transfer, hasil generate Noir |
| `src/MockERC20.sol` | Token uji dengan mint permissionless |
| `script/Deploy.s.sol` | Deploy kolam, verifier, dan token mock |
| `script/DemoIqiaDesk.s.sol` | Demo transfer on-chain lewat Aqua + SwapVM |

## Migrasi yang sedang berjalan

Likuiditas sudah berpindah ke **1inch Aqua + SwapVM**. `SimpleAMM` yang lama
menahan reserve di dalam kontrak; Aqua tidak menahan apa pun — token tetap di
dompet market maker dan hanya ditarik saat swap benar-benar terjadi.

Peta komponennya di [`../docs/migrasi.md`](../docs/migrasi.md), rujukan teknis
Aqua/SwapVM di [`../docs/RESOURCES.md`](../docs/RESOURCES.md).

## Desimal

Token mock memakai **7 desimal**, bukan 18. Ini disengaja: sirkuit Noir
memaksakan `assert_64` pada besaran, dan 18 desimal membuat jumlah wajar
melampaui rentang 64-bit. Jangan naikkan tanpa menyesuaikan sirkuitnya.

## Perintah

```bash
forge build
forge test

export PRIVATE_KEY=0x<kunci-deployer>
export RPC_URL=https://<rpc-endpoint>

forge script script/Deploy.s.sol --rpc-url "$RPC_URL" --broadcast
```

## Catatan

`IqiaPool.settle()` tidak aktif. Jalur itu dulu menerima hasil pencocokan dari
enclave tepercaya milik chain lama. Penggantinya SwapVM — lihat `docs/migrasi.md`.

29 test Solidity, mencakup kedua opcode custom, perantara taker, dan
penyeimbangan kolam.
