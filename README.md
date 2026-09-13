<p align="center">
  <img src="frontend/src/assets/dark-logo.png" alt="Iqia" width="120" />
</p>

<h1 align="center">Iqia</h1>

<p align="center">
  Liquidity that never leaves your wallet.<br />
  A consumer app on 1inch Aqua where the pricing strategy is a SwapVM program you can read.
</p>

<p align="center">
  <a href="https://qia-1inch.vercel.app"><img src="https://img.shields.io/badge/LIVE%20DEMO-VERCEL-000000?style=flat-square&labelColor=555555&logo=vercel&logoColor=white" alt="Live demo" /></a>
  <img src="https://img.shields.io/badge/Base%20Sepolia-1inch%20Aqua-1b1b1b?style=flat-square&labelColor=555555" alt="Base Sepolia" />
  <img src="https://img.shields.io/badge/tests-51%20Foundry%20%C2%B7%2023%20encoder-1b1b1b?style=flat-square&labelColor=555555" alt="tests" />
</p>

<p align="center"><em>Powered by SwapVM — © Degensoft Ltd 2025</em></p>

---

Iqia is a DeFi app built on **1inch Aqua** where your liquidity never leaves your wallet. Aqua records an **allowance**, never a deposit, so the same balance earns fees from swaps **and stays spendable at any moment**. The price your money quotes is not a setting — it is a bytecode program, emitted on chain, that anyone can disassemble.

> **Delete our frontend and the product still exists.** Every fact about a position is readable with stock viem and no configuration.
>
> - `getLogs({ event: 'Shipped', address: AQUA })` → every position on the registry, including 10 other teams'
> - `disassemble(strategy)` → the exact instructions your money follows
> - `readContract({ functionName: 'rawBalances', ... })` → real-time backing status

<img width="1710" alt="Markets" src="docs/screenshot-markets.png" />

---

## What Makes Iqia Special

### Who This Is For

Meet Budi. He has been market-making on-chain for a year — WETH/USDC, one pair, one strategy, a Google Sheet tracking his PnL. It works until someone asks the only question that matters: *how do I know your strategy hasn't changed after the fact?*

He could deploy a vault contract, but then he holds everyone's funds and the strategy lives in storage only his ABI can read. He could use an AMM, but the pool forces him to split capital across pairs. He could publish his strategy document, but nobody diffs a CID.

Budi's problem is not a missing tool. It is that there is no standard where a market maker's strategy is **the public record itself** — readable by any viem client, provably immutable, and delegable to an agent for the numbers while the rules stay untouchable.

---

### The Problem

A market maker's position is two things: a set of rules (the strategy bytecode), and a set of numbers that move (the balances). Every existing structure blurs them.

- **AMM pools** — your money leaves your wallet, sits in a contract you don't control, and the strategy is the pool's constant-product formula. No customization.
- **Vault contracts** — composition lives in contract storage, readable only through that protocol's ABI and frontend; the operator who can rebalance can usually also rewrite the mandate.
- **Off-chain market makers** — the strategy document and the on-chain execution drift apart, and nobody verifies they match.
- **Bilateral OTC** — no public record, no way to verify pricing, no composability.

And none of them let the market maker **keep custody** while quoting. It is always "deposit first, then we'll price for you."

**How might we let a maker quote from their own wallet, with a strategy that is readable bytecode, where the same capital backs multiple pairs simultaneously?**

---

### The Solution

Iqia answers with five primitives from 1inch Aqua and two custom SwapVM opcodes.

**1. Allowance-based positions** — `Aqua.ship()` transfers nothing. It writes an allowance against the maker's own wallet. Your WETH balance after opening a position is identical to before, and you can spend it the same second. No deposit, no custody, no lock-up.

**2. Shared capital across markets** — `ship()` does not move tokens **and does not check balances**, so the same stack quotes in every market at once. Measured on-chain: 19.93 WETH backing 3 markets simultaneously, 3.00x capital efficiency. A pool would force you to split it three ways.

**3. Readable bytecode strategies** — Aqua emits the whole order in its `Shipped` event. Any maker's program can be disassembled without permission. Open `/market/<hash>` and read it:

```
000  23  SOLVENCY_GUARD   prices against the maker's real wallet backing
006  21  FLAT_FEE_IN      takes a flat fee from the input, before the curve
012  17  XYC_SWAP         constant-product curve, x·y=k
014  20  SALT             makes the strategy hash unique — no behaviour
```

**4. Solvency Guard (custom opcode 23)** — reads the maker's **real** wallet backing — `min(balanceOf, allowance)` — on every swap, and raises a surcharge proportional to any shortfall. This is what makes shared capital safe: when one market spends the shared backing, every other market reprices itself, with no keeper, no oracle, and no extra transaction.

**5. Exclusive Fill (custom opcode 22)** — only one named address may fill the order. Full 20-byte address comparison (unlike SwapVM's `PrivateOrder` which compares only the last 10 bytes, where "Birthday attack 80-bit collisions are feasible"). For an exclusive flow deal, "almost certainly them" is not a guarantee you can negotiate against.

---

## Features

- **Allowance-based liquidity** — ship() transfers nothing; your wallet balance is unchanged; you keep custody and can spend anytime
- **Shared capital** — one WETH balance backs WETH/USDC, WETH/DAI, and WETH/WBTC simultaneously — 3.00x capital efficiency measured on-chain
- **Readable bytecode strategies** — every position's program is emitted in the Shipped event and disassembled in-app; no ABI needed
- **4 strategy types** — Relaxed (full range), Concentrated (price band), Anti-arbitrage (decay), Private desk (exclusive fill)
- **Solvency Guard** — real-time backing check on every swap, automatic repricing on shortfall, no oracle needed
- **Multi-Aqua registry** — reads positions from our testnet Aqua AND the official 1inch Aqua on Base mainnet simultaneously
- **Markets page** — every position on both registries, disassembled with live balances
- **Savings** — one slider, one button; the app opens a position and shows exactly what it does
- **Open position** — 4-step wizard for advanced strategies with custom parameters
- **Swap** — on-chain quotes with real slippage bounds, no off-chain dependency
- **My desk** — capital efficiency dashboard across all your markets
- **Pay / Receive / Payment links** — send tokens to any address with EIP-681 compatible links
- **Portfolio** — all your positions in one view
- **Faucet** — mint test tokens directly from the app
- **Dark / Light mode** — full theme support
- **Post-swap actions** — after a swap, quick links to open positions, savings, or swap again

---

## Live on Base Sepolia

| Contract | Address | Notes |
|---|---|---|
| Aqua (registry) | [`0x6d4d017d…cD9Ea`](https://sepolia.basescan.org/address/0x6d4d017dE8d0A36dce7856Ee989624C6A18cD9Ea) | Deployed, 2 Shipped events |
| IqiaSwapVMRouter | [`0x970C3114…12185`](https://sepolia.basescan.org/address/0x970C3114C5Dcf853692bc8D3e0598d1AC9D12185) | SwapVM + 2 custom opcodes |
| IqiaAquaTaker | [`0xEAfd45D5…f3A9`](https://sepolia.basescan.org/address/0xEAfd45D5E7ECCF6014D91D9e3da39134C347f3A9) | Pool ↔ router adapter |
| MockWETH | [`0xD04A92C8…33E6`](https://sepolia.basescan.org/address/0xD04A92C83AFe71f4f69F9FAD0A33229BFBdE33E6) | 18 decimals, faucet |
| MockUSDC | [`0x44b99f76…876D`](https://sepolia.basescan.org/address/0x44b99f76f12e0Ece22f6bD76DcB305Afcf25876D) | 7 decimals, faucet |

**Also reads from:** [Official 1inch Aqua on Base mainnet](https://basescan.org/address/0x1111113ccf1426a8e30e2bff5e005d929bf6a90a) — real market maker positions from the 1inch ecosystem.

---

## Two Opcodes We Added to SwapVM

Redeploying a modified SwapVM is explicitly allowed by the 1inch Aqua track rules. We added two instructions and kept everything else stock.

### `SOLVENCY_GUARD` (23)

Reads the maker's **real** wallet backing — `min(balanceOf, allowance)` — on every swap, and raises a surcharge in proportion to any shortfall. This is what makes shared capital safe: when one market spends the shared backing, every other market reprices itself, with no keeper, no oracle, and no extra transaction.

Its placement is load-bearing and the compiler cannot enforce it: the guard must run **before** any instruction that shapes balances. Measured — guard after `concentrate` gives `4.742`, guard before gives `4.913`, identical to no guard at all. Silent failure, no revert.

> `test_GuardHarusSebelumInstruksiPembentukSaldo` in `contracts/test/Strategies.t.sol`

### `EXCLUSIVE_FILL` (22)

Only one named address may fill the order. SwapVM ships its own `PrivateOrder`, and we deliberately do not use it: it compares only the **last 10 bytes** of the address, and its own documentation says *"Birthday attack 80-bit collisions are feasible"*. For an exclusive flow deal, "almost certainly them" is not a guarantee you can negotiate against. Ours compares all 20 bytes.

> `test_Gate_RejectsHighBitsCollision` builds an address whose low 80 bits are identical to the named taker. `PrivateOrder` accepts it. We reject it.

---

## Strategies

| ID | Name | Opcodes | Description |
|---|---|---|---|
| `santai` | Relaxed | solvencyGuard → flatFeeIn → xycSwap | Quotes whole price range, small fee. Lowest earnings per capital. |
| `terkonsentrasi` | Concentrated | solvencyGuard → xycConcentrate → flatFeeIn → xycSwap | Liquidity in one price band. Higher earnings, stops earning outside band. |
| `anti-arbitrase` | Anti-arbitrage | solvencyGuard → decay → flatFeeIn → xycSwap | Quote catches up gradually after price moves. Anti-MEV. |
| `meja-privat` | Private desk | exclusiveFill → solvencyGuard → flatFeeIn → xycSwap | Only named address can fill. Tighter quotes for known flow providers. |

**Key invariants:**
1. `flatFeeIn` must be AFTER `xycConcentrate`
2. `solvencyGuard` must be BEFORE any balance-shaping instruction
3. Protocol fee precedes maker fee
4. No external yield — earnings come only from swap fees

---

## The App

| Page | What it answers |
|---|---|
| **Markets** | *What positions exist on this registry?* Every position — ours and other teams' — with live balances. |
| **Open position** | *How do I want it to behave?* Four strategies, the same machine shown as controls. |
| **Swap** | On-chain quotes, real slippage bounds. |
| **Savings** | *Is my money working, and is it safe?* One slider. The machine is shown as reassurance, in plain language. |
| **My desk** | Capital efficiency across your markets. |
| **Position detail** | *Can I verify this?* The program, disassembled. The same machine as evidence. |
| **Portfolio** | All your positions in one view. |
| **Pay · Receive · Payment link** | Send and receive tokens with payment links. |
| **Faucet** | Mint test tokens. |

### One button, even with one token

A position needs both sides — `XYCSwap` rejects a zero balance, and a one-sided position looks alive while serving nothing. So if you only hold USDC, Savings swaps half first and then opens. Two signatures, one decision.

It cannot be one transaction, and that is not a limitation we can engineer away: `Aqua.ship()` uses `msg.sender` as the maker, so a helper contract shipping on your behalf would become the maker of its own balance. The steps are visible because the app refuses custody.

---

## Architecture

### System Flow

```
User Wallet (tokens stay here)
    |
    | ship() — records allowance only, no token transfer
    v
Aqua Registry (virtual balance)
    |
    | pull() / push() — actual token movement during swap
    v
IqiaSwapVMRouter (= Aqua app)
    |
    | Executes bytecode strategy program
    |
    +-- SolvencyGuard (opcode 23) — reads real wallet backing
    +-- ExclusiveFill (opcode 22) — gate by address
    +-- XYCSwap (opcode 17) — constant product curve
    +-- flatFeeIn (opcode 21) — maker fee
    +-- aquaProtocolFee (opcode 28) — protocol revenue
    +-- xycConcentrate (opcode 18) — concentrated liquidity
    +-- decay (opcode 19) — anti-MEV
    +-- salt (opcode 20) — unique hash
```

### Resolution Pipeline (Markets)

```
fetchMarkets()
    |
    +-- Primary Aqua (Base Sepolia)
    |       scanLogs(Shipped) → scanLogs(Pushed) → scanLogs(Docked)
    |       filter closed positions (tokensCount == 0xff)
    |
    +-- Extra Aqua (Base mainnet, official 1inch)
    |       same scan, throttled for public RPC
    |
    +-- Read rawBalances() per token per position
    +-- Read token metadata (symbol, name, decimals)
    +-- Sort: our positions first, then by liquidity
    v
Markets[] — every live position with real balances
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite 5, TypeScript 5.7, Tailwind CSS 3.4 |
| Web3 | viem 2.55, wagmi 2.19, @wagmi/core 3.6 |
| 1inch SDK | @1inch/aqua-sdk ^0.3.1 |
| State | @tanstack/react-query ^5.101 |
| Charts | lightweight-charts 5.2 |
| 3D | three 0.169, @react-three/fiber, @react-three/drei |
| Protocol SDK | @iqia/swapvm (workspace, zero runtime dependencies) |
| Smart Contracts | Solidity 0.8.30, Foundry, OpenZeppelin 5.4 |
| Blockchain | Base Sepolia (chain 84532) + Base mainnet (chain 8453) read |
| Monorepo | pnpm 10.11 workspaces |

---

## Smart Contracts

### `IqiaSwapVMRouter.sol`

Extends `Simulator`, `SwapVM`, `IqiaOpcodes`. Serves as both the **strategy execution engine** AND the **Aqua app** — single contract, dual role. Constructor: `(address aqua, address weth, address owner)`.

### `IqiaOpcodes.sol`

Extends `AquaOpcodes`, `ExclusiveFill`, `SolvencyGuard`. Adds opcodes at slots 22 and 23. `_requireFreeSlot()` validates slots are not already taken (runs on every quote/swap).

### `ExclusiveFill.sol` (opcode 22)

Full 20-byte address comparison. `ctx.query.taker` is set by SwapVM from `msg.sender`, cannot be spoofed. Args: 20-byte taker address.

### `SolvencyGuard.sol` (opcode 23)

Reads `min(balanceOf, allowance)` for tokenOut. If backing < virtual balance, calculates surcharge: `maxSurchargeBps * (virtual - backing) / virtual`. Must be placed BEFORE any balance-shaping instruction.

### `IqiaAquaTaker.sol`

Adapter that lets a liquidity pool act as SwapVM taker without modifying pool contracts. Flow: pool → pulls tokenIn → calls router.swap() → SwapVM callback → push to Aqua → Aqua pulls tokenOut from maker's wallet → forwards to pool.

### `MockERC20.sol`

Permissionless-mint ERC20 for testnet faucet. `mint(to, value)` and `faucet()` — 1,000 whole units per claim, unlimited.

---

## Setup

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/) 10+
- [Foundry](https://book.getfoundry.sh/) (for contracts)

### Smart Contract Setup

```bash
# Install Foundry
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Clone the repository
git clone https://github.com/maulana-tech/qia-1inch.git
cd qia-1inch/contracts

# Build — no dependencies, no network access needed
forge build

# Run tests
forge test          # 51 tests across 12 suites
```

### Frontend Setup

```bash
cd qia-1inch

# Install dependencies
pnpm install

# Configure environment
cp frontend/.env.84532 frontend/.env.local   # Base Sepolia deployment

# Start development server
pnpm --filter frontend dev
```

Open [http://localhost:5173](http://localhost:5173). Connect a wallet on Base Sepolia, mint test tokens on **Faucet**, then **Savings → Start**.

Or skip the setup entirely: **[qia-1inch.vercel.app](https://qia-1inch.vercel.app)** runs against the live Base Sepolia deployment. You need a wallet on Base Sepolia with a little test ETH for gas; every token you trade with is mintable from the faucet.

### Protocol SDK

```bash
# Build the SwapVM encoder
pnpm --filter @iqia/swapvm build

# Run golden vector tests (byte-for-byte against Solidity)
pnpm --filter @iqia/swapvm test     # 23 tests
```

### Checks

```bash
cd contracts && forge test          # 51 tests
pnpm --filter @iqia/swapvm test     # 23 golden vectors
pnpm --filter frontend lint         # clean
```

---

## Operator Scripts

```bash
# One-time: deploy Aqua + Router + first position
cd contracts && ./script/deploy.sh

# Point the desk at the official Aqua registry
cast wallet import desk --interactive
DESK_ACCOUNT=desk ./contracts/script/migrate-to-official-aqua.sh

# Add two more markets from the same WETH capital
DESK_ACCOUNT=desk ./contracts/script/add-markets.sh

# Demo: shared capital backing three markets
DESK_ACCOUNT=desk ./contracts/script/shared-capital.sh
```

Use the Foundry keystore, not a raw key. A key in an environment variable leaks into shell history, the process list, and any log that records the environment.

**RPC:** reads go through `https://sepolia.base.org`, with throttling for Base mainnet public RPC. The app handles rate limiting (429) and silent empty responses from public RPCs gracefully — retry logic with exponential backoff built into `scanLogs`.

---

## SwapVM Opcodes

| Opcode | Name | Description |
|---|---|---|
| 10 | `JUMP` | Unconditional jump |
| 13 | `DEADLINE` | Time limit (Unix seconds) |
| 17 | `XYC_SWAP` | Constant-product curve x·y=k |
| 18 | `XYC_CONCENTRATE` | Concentrated liquidity in a price band |
| 19 | `DECAY` | Virtual balance decays over time, anti-MEV |
| 20 | `SALT` | Makes strategyHash unique (no behavioural change) |
| 21 | `FLAT_FEE_IN` | Flat fee taken from input side |
| 22 | `EXCLUSIVE_FILL` | **(Iqia)** Only a named address may fill — full 20-byte comparison |
| 23 | `SOLVENCY_GUARD` | **(Iqia)** Price adjusts based on real wallet backing |
| 28 | `AQUA_PROTOCOL_FEE_IN` | Protocol fee sent to treasury in the same swap |

**Instruction format:** `[opcode 1 byte][length 1 byte][arguments]` — max 255 bytes per instruction.

**BPS basis:** 1e9 (not 10,000).

---

## Known Limits

Stated plainly, because a submission that hides them is worth less than one that does not.

- **The protocol fee is best-effort.** `_aquaProtocolFeeAmountInXD` pulls from the maker's *pre-existing* Aqua balance; if it cannot cover it, `ProtocolFeeSkipped` fires and the swap proceeds free. A one-sided position earns the treasury nothing on the common direction.
- **No APY anywhere, deliberately.** Earnings are reconstructed from `Pulled` and `Pushed` events. A forecast dressed as a number is worse than no number.
- **The slot guard costs gas on every swap.** `_opcodes()` runs inside `quote()` and `swap()`, so `_requireFreeSlot` re-answers a question fixed at deploy time. Left alone on purpose — the router is live with positions on it.
- **Partial withdrawal is not implemented.** Closing is all or nothing.
- **Base mainnet public RPC rate limits aggressively.** Extra registry scans are throttled (1 chunk at a time, 800ms delay) to stay under 429 thresholds.

---

## Repo

```
contracts/
  src/iqia/                 IqiaSwapVMRouter, IqiaOpcodes
  src/iqia/instructions/    SolvencyGuard, ExclusiveFill
  test/                     12 suites, 51 tests
  script/                   deploy, migrate to official Aqua, add markets
protocol/swapvm/            TypeScript program encoder + disassembler
frontend/
  src/components/           React UI components
  src/pages/                Route pages (Hub, Savings, Strategy, Desk, Swap, Pay, etc.)
  src/lib/                  Config, markets, payments, desk, strategies, wagmi
```

The encoder is not a convenience wrapper. Every program the app ships is built in TypeScript and locked against Solidity output byte-for-byte in `protocol/swapvm/test/golden.test.ts` — if the two ever disagree, the tests fail before a wrong program reaches a wallet.

---

## Demo Video

See [`docs/demo.mp4`](docs/demo.mp4) for a walkthrough of the app — opening a position, swapping, checking markets, and using the savings flow.

---

## License

Our contracts extend SwapVM and are therefore derivative work: `IqiaOpcodes.sol` and `IqiaSwapVMRouter.sol` fall under **LicenseRef-Degensoft-SwapVM-1.1**, whose §3.1 requires derivative sources to carry the same license, preserve notices, and attribute *"Powered by SwapVM — © Degensoft Ltd 2025"*. The rest of this repository is MIT.

Hackathon use is free under §4. The treasury fee this app can charge is covered by the §5.3 enforcement waiver for market-making activity — a waiver, not a license, and revocable.

Coin icons are linked from [Cryptofonts/cryptoicons](https://github.com/Cryptofonts/cryptoicons) (GPL-3.0) over a CDN rather than bundled, so no GPL asset is redistributed here.
