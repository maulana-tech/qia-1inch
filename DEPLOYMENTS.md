# Iqia Deployments

This document tracks the deployed smart contract addresses for the Iqia protocol on various networks.

## Flare Coston2 (Testnet)
**Chain ID:** 114

### Core Contracts
| Contract | Address | Description |
|---|---|---|
| **IqiaPool** | `0x72a86479837B87cc2aA73daBd7B54CB4DBf0AB84` | Core L1 pool handling deposits, withdrawals, and state transitions. |
| **WithdrawVerifier** | `0xA0c9791e4FE34734D06fDD2ded0C0e0cd5b7F0f6` | ZK SNARK Verifier (Noir UltraHonk) for private withdrawals. |
| **MockPoseidon** | `0x3152B6f625F25B6a2Aa0Adb57017eB74acA65ecB` | Mock BN254 Poseidon2 hasher (to be replaced with real precompile/contract). |

### Mock ERC20 Tokens (Faucet)
| Token | Address | Decimals |
|---|---|---|
| **MockUSDC** | `0x072F9Fd7Aa8F8EA6664fD77F7e264CDeC4052F74` | 7 |
| **MockETH** | `0x017ACB212AE11De96fEF8bbd6F52E677eDF040bd` | 7 |
| **MockBTC** | `0xF84B7457B9d8Eb4ACfbc875225514A04105a70D7` | 7 |
| **MockXRP** | `0xb1340025b940bA91B400D8b111D728c19FcF779b` | 7 |

### AMM Pools (SimpleAMM)
| Pair | Address | Description |
|---|---|---|
| **FLR/USDC** | `0x6BdB65a29aB0aA63Ed9ab1c6EC238Cd455cbdB2c` | FLR ↔ USDC swap pool |
| **FLR/ETH** | `0x8Ff8Ba795085540cC7021c5eb58CF4971eb3940E` | FLR ↔ ETH swap pool |
| **FLR/BTC** | `0xC5F9Be31f97EA13729a832F1fc41797D41C89aD1` | FLR ↔ BTC swap pool |
| **FLR/XRP** | `0xD0aCae33a7c4eB3b2A3Ce1bb3f2fc489e6B40B8e` | FLR ↔ XRP swap pool |
| **USDC/ETH** | `0x8A28b7F3448f75789c9D6ff5f0E5DdC59C744e98` | USDC ↔ ETH swap pool |

### ZK Transfer
| Contract | Address | Description |
|---|---|---|
| **MockTransferVerifier** | `0x6edc1c62e6b0110a00c6c28a7b54904ab856cffb` | Mock verifier (always true) for testing |
| **TransferProcessor** | `0x6258f86d8c4931bfc1ac1bd779f912d2a4288faa` | Processes ZK transfer proofs |

*Deployed on: August 14, 2026*
