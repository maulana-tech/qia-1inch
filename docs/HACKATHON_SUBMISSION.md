# 1inch Hackathon Submission — Prize $7,000

## Prize: 1inch — $7,000

---

## How are you using this Protocol / API?

We use **1inch Aqua + SwapVM** as the full stack of Iqia — a retail-friendly, non-custodial market-making app. The integration goes deep across four layers:

**1. TypeScript SDK (`@1inch/aqua-sdk`):**
- `AQUA_CONTRACT_ADDRESSES` resolves the official Aqua registry address per chain (16+ networks, including Base mainnet) — no hardcoding needed.
- `AquaProtocolContract` generates `ship()` and `dock()` calldata for opening/closing liquidity positions.
- `ABI.AQUA_ABI` is the source of truth for all Aqua contract interactions (balances, events).
- `AquaProtocolContract.calculateStrategyHash()` derives the on-chain position identifier.
- Event signatures (`Shipped`, `Pushed`, `Docked`, `Pulled`) decoded from the official ABI drive our client-side indexer — no backend required.

**2. 1inch Aqua Protocol (Solidity, vendored from `github.com/1inch/aqua`):**
- Our deployed router `IqiaSwapVMRouter` is a registered **Aqua app** — positions ship strategies into the official Aqua registry at `0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a`.
- `IqiaAquaTaker.sol` calls `AQUA.push()` directly to settle swaps against maker balances that never leave the maker's wallet.

**3. 1inch SwapVM (vendored from `github.com/1inch/swap-vm`):**
- `IqiaSwapVMRouter` extends `SwapVM` directly — it is a redeployment of the SwapVM engine with two new opcodes (`ExclusiveFill` = opcode 22, `SolvencyGuard` = opcode 23) added on top of the official `AquaOpcodes` set.
- All strategy programs are assembled using `XYCSwap`, `flatFeeIn`, `salt`, `Controls`, `MakerTraitsLib`, `TakerTraitsLib` from SwapVM.

**4. 1inch Token List REST API:**
- `https://tokens.1inch.io/v1.2/{chainId}` is queried for token metadata (symbol, name, logo) — no API key required.

---

## Why are we applicable for this prize?

Iqia is the first app to expose 1inch Aqua's non-custodial liquidity model to retail users through a savings-style UI — anyone can become a market maker by allocating a percentage of their wallet balance, without depositing funds anywhere. We use the official `@1inch/aqua-sdk` throughout (not a reimplementation), built and deployed a SwapVM router that extends 1inch's own opcode set with two novel instructions, and demonstrate Aqua's unique **shared capital** property on-chain — one wallet balance backing multiple positions simultaneously across different pairs, verified in `contracts/test/SharedCapital.t.sol`. The entire flow (allowance recording, swap settlement, earnings tracking via Aqua events) is fully permissionless and on-chain.

---

## Links to the lines of code where the tech is used

| Usage | Link |
|---|---|
| SDK import: `AQUA_CONTRACT_ADDRESSES`, contract address resolution | https://github.com/maulana-tech/qia-1inch/blob/main/frontend/src/lib/config.ts#L1 |
| `AquaProtocolContract.ship()` — open position | https://github.com/maulana-tech/qia-1inch/blob/main/frontend/src/lib/savings.ts#L232 |
| `AquaProtocolContract.dock()` — close position | https://github.com/maulana-tech/qia-1inch/blob/main/frontend/src/lib/savings.ts#L260 |
| Official `ABI.AQUA_ABI` + event indexing | https://github.com/maulana-tech/qia-1inch/blob/main/frontend/src/lib/markets.ts#L16 |
| SwapVM `quote` + `swap` with `useTransferFromAndAquaPush` | https://github.com/maulana-tech/qia-1inch/blob/main/frontend/src/lib/desk.ts |
| `AQUA.push()` in Solidity taker contract | https://github.com/maulana-tech/qia-1inch/blob/main/contracts/src/iqia/IqiaAquaTaker.sol |
| Router extends SwapVM + imports AquaOpcodes | https://github.com/maulana-tech/qia-1inch/blob/main/contracts/src/iqia/IqiaOpcodes.sol |
| 1inch Token List API | https://github.com/maulana-tech/qia-1inch/blob/main/frontend/src/lib/markets.ts |

---

## How easy is it to use the API / Protocol?

**7 / 10**

The `@1inch/aqua-sdk` TypeScript package covers the critical path well: `AquaProtocolContract` for calldata generation, the official ABI, and automatic contract address resolution across 16+ chains saved significant engineering time. The 1inch Token List API is frictionless (no key, clean JSON). The main difficulty is architectural: Aqua's `msg.sender`-as-maker constraint (ship/dock must come directly from the user's wallet) rules out contract wrappers and requires careful reasoning upfront. SwapVM's opcode format, `buildTakerData` flags, and the `strategyHash` derivation have a steep learning curve — the pieces only click together after reading the Solidity source directly. Browser compatibility also required a custom `assert` shim for Vite, since the SDK calls Node's `assert` at module load.
