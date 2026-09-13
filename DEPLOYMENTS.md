# Deployment Iqia

## Base Sepolia (testnet) — ACTIVE

**Chain ID:** 84532 · **Explorer:** https://sepolia.basescan.org

**Deployed:** 2026-09-13 · **Deployer:** `0x3a8d93D5F52a26689b075A49E67F4f8924BeC84B`

### Aqua / SwapVM

| Kontrak | Alamat | Keterangan |
|---|---|---|
| Aqua | `0x6d4d017dE8d0A36dce7856Ee989624C6A18cD9Ea` | Registry saldo virtual |
| IqiaSwapVMRouter | `0x970C3114C5Dcf853692bc8D3e0598d1AC9D12185` | Router SwapVM custom, sekaligus Aqua app |
| IqiaAquaTaker | `0xEAfd45D5E7ECCF6014D91D9e3da39134C347f3A9` | Adapter pool → router |

### Token faucet

| Token | Alamat | Desimal |
|---|---|---|
| MockWETH | `0xD04A92C83AFe71f4f69F9FAD0A33229BFBdE33E6` | 18 |
| MockUSDC | `0x44b99f76f12e0Ece22f6bD76DcB305Afcf25876D` | 7 |

## Ethereum Sepolia (testnet) — DEPRECATED

**Chain ID:** 11155111 · **Explorer:** https://sepolia.etherscan.io

**Deployed:** 2026-09-07 · **Deployer:** `0x3a8d93D5F52a26689b075A49E67F4f8924BeC84B`

| Kontrak | Alamat |
|---|---|
| Aqua | `0xbfeE998a404B38E90d5f8fb88Fc0a19279Fe2c11` |
| IqiaSwapVMRouter | `0xe7BdB2AceBB51E678d2fDFBa2bAE8D263cbaF8BE` |
| MockWETH | `0x1207A026f2D052b9FB8A74F8E01f917BF956bE81` |
| MockUSDC | `0x8eed5f3Fb7124A35732e41203cb54C34CbC2fFdf` |

## Fork lokal

Untuk menguji terhadap SwapVM dan Aqua resmi, fork Base mainnet:

```bash
anvil --fork-url https://mainnet.base.org
```
