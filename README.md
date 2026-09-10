<p align="center">
  <img src="frontend/src/assets/iqia-logo.png" alt="Iqia" width="120" />
</p>

<h1 align="center">Iqia</h1>

<p align="center">
  Savings that never leave your wallet.<br />
  A consumer app on 1inch Aqua where the pricing strategy is a SwapVM program you can read.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Ethereum-Sepolia-1b1b1b" alt="Ethereum Sepolia" />
  <img src="https://img.shields.io/badge/1inch-Official%20Aqua%20registry-1b1b1b" alt="Official Aqua" />
  <img src="https://img.shields.io/badge/tests-51%20Foundry%20%C2%B7%2023%20encoder-1b1b1b" alt="tests" />
</p>

<p align="center"><em>Powered by SwapVM — © Degensoft Ltd 2025</em></p>

---

## The idea in one paragraph

Put money in a liquidity pool and it stops being yours to spend. Iqia does the
opposite: Aqua records an **allowance**, never a deposit, so the same balance
earns fees from swaps **and stays spendable at any moment**. The price your money
quotes is not a setting — it is a bytecode program, emitted on chain, that anyone
can disassemble. Including the strategies of the ten other teams sharing the same
registry.

---

## Live on Ethereum Sepolia

Everything below is on the **official 1inch Aqua registry** — the same contract
address 1inch deploys on 16 chains, byte-identical to the Base mainnet
deployment (`keccak 0x720bc02d…`).

| | |
|---|---|
| Aqua registry | [`0x1111113CCf…6a90a`](https://sepolia.etherscan.io/address/0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a) — official 1inch |
| Our SwapVM router | [`0x072F9Fd7…52F74`](https://sepolia.etherscan.io/address/0x072F9Fd7Aa8F8EA6664fD77F7e264CDeC4052F74) — SwapVM + 2 custom opcodes |
| Maker | [`0x3a8d93D5…eC84B`](https://sepolia.etherscan.io/address/0x3a8d93D5F52a26689b075A49E67F4f8924BeC84B) |
| Example swap | [`0x9fe91859…4d91`](https://sepolia.etherscan.io/tx/0x9fe91859a32705c4e0984f5e9e2f532207ee982ffd632d49807fc9973cda4d91) — 250 USDC → 0.0658 WETH |

Three markets are open right now — WETH/USDC, WETH/DAI, WETH/WBTC — all backed
by **the same 19.93 WETH**. Capital efficiency **3.00×**, measured on chain.

---

## Why this could not be built on an AMM

Three properties, each verified by a test, none of them possible in a pool.

### 1. The money never moves

`Aqua.ship()` transfers nothing. It writes an allowance against the maker's own
wallet. Your balance after opening a position is identical to before, and you can
spend it the same second.

> `contracts/test/ZapIntoSavings.t.sol` asserts the wallet balance is unchanged
> across `ship()`, inside the real consumer flow rather than a unit test.

### 2. One balance, many markets

`ship()` does not move tokens **and does not check balances**, so the same stack
quotes in every market at once. Ours backs three. A pool would force you to split
it three ways.

> `contracts/test/SharedCapital.t.sol`. Swapping in one market moves the price in
> the others in the same transaction: `0.787291726987970835 → 0.784435693838646721`.

### 3. The strategy is readable bytecode

Aqua emits the whole order in its `Shipped` event, so any maker's program can be
disassembled without permission. Open `/market/<hash>` on any of the 40 positions
on the registry and read it:

```
000  23  SOLVENCY_GUARD   prices against the maker's real wallet backing
006  21  FLAT_FEE_IN      takes a flat fee from the input, before the curve
012  17  XYC_SWAP         constant-product curve, x·y=k
014  20  SALT             makes the strategy hash unique — no behaviour
```

---

## Two opcodes we added to SwapVM

Redeploying a modified SwapVM is explicitly allowed by the track rules. We added
two instructions and kept everything else stock.

### `SOLVENCY_GUARD` (23)

Reads the maker's **real** wallet backing — `min(balanceOf, allowance)` — on every
swap, and raises a surcharge in proportion to any shortfall. This is what makes
shared capital safe: when one market spends the shared backing, every other market
reprices itself, with no keeper, no oracle, and no extra transaction.

Its placement is load-bearing and the compiler cannot enforce it: the guard must
run **before** any instruction that shapes balances. Measured — guard after
`concentrate` gives `4.742`, guard before gives `4.913`, identical to no guard at
all. Silent failure, no revert.

> `test_GuardHarusSebelumInstruksiPembentukSaldo` in `contracts/test/Strategies.t.sol`

### `EXCLUSIVE_FILL` (22)

Only one named address may fill the order. SwapVM ships its own `PrivateOrder`,
and we deliberately do not use it: it compares only the **last 10 bytes** of the
address, and its own documentation says *"Birthday attack 80-bit collisions are
feasible"*. For an exclusive flow deal, "almost certainly them" is not a guarantee
you can negotiate against. Ours compares all 20 bytes.

> `test_Gate_RejectsHighBitsCollision` builds an address whose low 80 bits are
> identical to the named taker. `PrivateOrder` accepts it. We reject it.

---

## The app

| Page | What it answers |
|---|---|
| **Savings** | *Is my money working, and is it safe?* One slider. The machine is shown as reassurance, in plain language. |
| **Open position** | *How do I want it to behave?* Four strategies, the same machine shown as controls. |
| **Markets** | Every position on the official registry — ours and 10 other teams'. |
| **Position** | *Can I verify this?* The program, disassembled. The same machine as evidence. |
| **My desk** | Capital efficiency across your markets. |
| **Swap** | On-chain quotes, real slippage bounds. |
| **Portfolio · Pay · Receive · Payment link · Faucet** | Wallet basics. |

Savings hides nothing. Hiding the mechanism would contradict the app's own claim
and, worse, hide the only reason to choose Aqua at all — *your money never leaves
your wallet* is a mechanical fact, not a feature bullet.

### One button, even with one token

A position needs both sides — `XYCSwap` rejects a zero balance, and a one-sided
position looks alive while serving nothing. So if you only hold USDC, Savings
swaps half first and then opens. Two signatures, one decision.

It cannot be one transaction, and that is not a limitation we can engineer away:
`Aqua.ship()` uses `msg.sender` as the maker, so a helper contract shipping on
your behalf would become the maker of its own balance. The steps are visible
because the app refuses custody.

---

## Run it

```bash
pnpm install
cp frontend/.env.sepolia.example frontend/.env.local   # already points at the official registry
pnpm --filter frontend dev
```

Open <http://localhost:5173>. Connect a wallet on Sepolia, mint test tokens on
**Faucet**, then **Savings → Start**.

Every user action is in the browser — ship, close, swap, send, wrap. The shell
scripts below are operator tools for deployment, not part of the user flow.

### Checks

```bash
cd contracts && forge test          # 51 tests
pnpm --filter @iqia/swapvm test     # 23 golden vectors, byte-for-byte against Solidity
pnpm --filter frontend test         # amount parsing, payment links, EIP-681
pnpm --filter frontend lint         # clean
```

---

## Repo

```
contracts/
  src/iqia/                 IqiaSwapVMRouter, IqiaOpcodes
  src/iqia/instructions/    SolvencyGuard, ExclusiveFill
  test/                     12 suites, 51 tests
  script/                   deploy, migrate to official Aqua, add markets
protocol/swapvm/            TypeScript program encoder + disassembler
frontend/                   React + viem + wagmi
```

The encoder is not a convenience wrapper. Every program the app ships is built in
TypeScript and locked against Solidity output byte-for-byte in
`protocol/swapvm/test/golden.test.ts` — if the two ever disagree, the tests fail
before a wrong program reaches a wallet.

---

## Operator scripts

```bash
# One-time: point the desk at the official Aqua registry
cast wallet import desk --interactive
DESK_ACCOUNT=desk ./contracts/script/migrate-to-official-aqua.sh

# Add two more markets from the same WETH capital
DESK_ACCOUNT=desk ./contracts/script/add-markets.sh

# One real swap through the position, for the demo
DESK_KEY=0x… node frontend/scripts/demo-swap.mjs
```

Use the Foundry keystore, not a raw key. A key in an environment variable leaks
into shell history, the process list, and any log that records the environment.

**RPC:** reads go through `https://sepolia.gateway.tenderly.co`, writes through
`publicnode`. This split is deliberate. Measured: publicnode returns an empty
array for `eth_getLogs` on roughly half of all calls — no error, just silence,
which made the Markets page report "no active markets" on a chain that had live
positions. Tenderly answered 30 of 30 correctly, but rate-limits
`eth_sendRawTransaction`. So: read from the honest one, send through the one that
accepts writes.

---

## Known limits

Stated plainly, because a submission that hides them is worth less than one that
does not.

- **The protocol fee is best-effort.** `_aquaProtocolFeeAmountInXD` pulls from the
  maker's *pre-existing* Aqua balance; if it cannot cover it, `ProtocolFeeSkipped`
  fires and the swap proceeds free. A one-sided position earns the treasury
  nothing on the common direction. Revenue must be read from `Pulled` events, never
  computed from volume × rate. Pinned in `contracts/test/ProtocolFee.t.sol`.
- **No APY anywhere, deliberately.** Earnings are reconstructed from `Pulled` and
  `Pushed` events. A forecast dressed as a number is worse than no number.
- **The slot guard costs gas on every swap.** `_opcodes()` runs inside `quote()`
  and `swap()`, so `_requireFreeSlot` re-answers a question fixed at deploy time.
  It belongs in the constructor. Left alone on purpose — the router is live with
  positions on it, and source that no longer matches deployed bytecode is worse
  than the wasted gas.
- **Partial withdrawal is not implemented.** Closing is all or nothing.

---

## License

Our contracts extend SwapVM and are therefore derivative work: `IqiaOpcodes.sol`
and `IqiaSwapVMRouter.sol` fall under **LicenseRef-Degensoft-SwapVM-1.1**, whose
§3.1 requires derivative sources to carry the same license, preserve notices, and
attribute *"Powered by SwapVM — © Degensoft Ltd 2025"*. The rest of this
repository is MIT.

Hackathon use is free under §4. The treasury fee this app can charge is covered by
the §5.3 enforcement waiver for market-making activity — a waiver, not a license,
and revocable.

Coin icons are linked from [Cryptofonts/cryptoicons](https://github.com/Cryptofonts/cryptoicons)
(GPL-3.0) over a CDN rather than bundled, so no GPL asset is redistributed here.
