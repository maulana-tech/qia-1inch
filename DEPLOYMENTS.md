# Deployment Iqia

## Base Sepolia (testnet)

**Chain ID:** 84532 · **Explorer:** https://sepolia.basescan.org

Belum dideploy. Isi tabel ini setelah menjalankan skrip deploy.

### Kontrak inti

| Kontrak | Alamat | Keterangan |
|---|---|---|
| IqiaPool | `0x…` | Kolam terlindung: deposit, withdraw, Merkle tree |
| WithdrawVerifier | `0x…` | Verifier UltraHonk untuk withdraw privat |
| MockPoseidon | `0x…` | Hasher Poseidon2 sementara |
| TransferProcessor | `0x…` | Transfer privat berbasis ZK |
| MockTransferVerifier | `0x…` | Verifier tiruan — **selalu true**, hanya untuk uji |

### Aqua / SwapVM

| Kontrak | Alamat | Keterangan |
|---|---|---|
| Aqua | `0x…` | Registry saldo virtual |
| IqiaSwapVMRouter | `0x…` | Router SwapVM custom, sekaligus Aqua app |

SwapVM resmi ada di `0x111111338c5091E8440b67B168bAe16a668AC0De` pada Base
mainnet dan 14 chain lain, tapi tidak di Base Sepolia. Untuk testnet, router
custom dideploy sendiri — syarat hackathon mengizinkan redeploy SwapVM yang
dimodifikasi. Lihat `docs/RESOURCES.md`.

### Token faucet

Memakai 7 desimal, bukan 18. Alasannya di `contracts/README.md`.

| Token | Alamat | Desimal |
|---|---|---|
| MockUSDC | `0x…` | 7 |
| MockWBTC | `0x…` | 7 |
| MockDAI | `0x…` | 7 |

## Fork lokal

Untuk menguji terhadap SwapVM dan Aqua resmi, fork Base mainnet:

```bash
anvil --fork-url https://mainnet.base.org
```
