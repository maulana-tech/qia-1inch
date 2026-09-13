# Deployment Iqia

## Ethereum Sepolia (testnet)

**Chain ID:** 11155111 · **Explorer:** https://sepolia.etherscan.io

**Deployed:** 2026-09-07 · **Deployer:** `0x3a8d93D5F52a26689b075A49E67F4f8924BeC84B`

### Aqua / SwapVM

| Kontrak | Alamat | Keterangan |
|---|---|---|
| Aqua | `0xbfeE998a404B38E90d5f8fb88Fc0a19279Fe2c11` | Registry saldo virtual |
| IqiaSwapVMRouter | `0xe7BdB2AceBB51E678d2fDFBa2bAE8D263cbaF8BE` | Router SwapVM custom, sekaligus Aqua app |
| IqiaAquaTaker | `0x003B5A0F4c85287F9d49C8d067ec301210E41be5` | Adapter pool → router |

### Token faucet

Memakai 7 desimal, bukan 18. Alasannya di `contracts/README.md`.

| Token | Alamat | Desimal |
|---|---|---|
| MockWETH | `0x1207A026f2D052b9FB8A74F8E01f917BF956bE81` | 18 |
| MockUSDC | `0x8eed5f3Fb7124A35732e41203cb54C34CbC2fFdf` | 7 |

## Fork lokal

Untuk menguji terhadap SwapVM dan Aqua resmi, fork Base mainnet:

```bash
anvil --fork-url https://mainnet.base.org
```
