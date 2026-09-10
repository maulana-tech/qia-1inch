import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAccount } from 'wagmi'
import { readContracts } from '@wagmi/core'
import { erc20Abi, formatUnits, type Address } from 'viem'

import { fetchActiveStrategies } from '../lib/markets'
import { positionBalancesOrZero } from '../lib/savings'
import { quotePosition } from '../lib/desk'
import { tokenDecimals } from '../lib/payments'
import { CURATED_TOKENS } from '../lib/tokens'
import { DESK_CONFIGURED } from '../lib/config'
import { wagmiConfig, ACTIVE_CHAIN_ID } from '../lib/wagmi'
import { Button, Card, CardContent, CardHeader, CardTitle, PageHeader } from '../components/ui'

/**
 * Meja: satu kantong modal, banyak pasar.
 *
 * Ini satu-satunya halaman yang menunjukkan properti Aqua yang tidak dimiliki
 * AMM mana pun. `ship()` tidak memindahkan token DAN tidak memeriksa saldo, jadi
 * 10 WETH yang sama bisa terdaftar sebagai likuiditas di beberapa pasar
 * sekaligus. Di Uniswap, 10 WETH-mu ada di SATU pool.
 *
 * Yang membuatnya tidak sembrono: `SolvencyGuard` membaca dompet yang sama di
 * setiap pasar. Begitu satu pasar menghabiskan sebagian modal bersama, pasar
 * LAIN ikut memburuk harganya — tanpa keeper, tanpa oracle, tanpa transaksi
 * tambahan. Itu yang bisa kamu lihat langsung di sini: tukar di satu baris,
 * muat ulang, dan baris lain ikut bergerak.
 *
 * Diukur di `contracts/test/SharedCapital.t.sol`.
 */
interface DeskRow {
  hash: `0x${string}`
  app: string
  strategy: `0x${string}`
  pair: string
  tokenIn: string
  tokenOut: string
  decIn: number
  decOut: number
  balances: [bigint, bigint]
  quote: bigint | null
}

interface Committed {
  token: string
  code: string
  decimals: number
  /** Yang benar-benar ada di dompet. */
  real: bigint
  /** Jumlah yang didaftarkan ke seluruh posisi. */
  committed: bigint
}

const codeOf = (a: string) =>
  CURATED_TOKENS.find((t) => t.sac?.toLowerCase() === a.toLowerCase())?.code ??
  `${a.slice(0, 6)}…${a.slice(-4)}`

/** Ukuran kutipan tetap, supaya perbandingan antar pasar berarti. */
const QUOTE_UNITS = 1_000n

export function DeskPage() {
  const { address } = useAccount()
  const [rows, setRows] = useState<DeskRow[] | null>(null)
  const [committed, setCommitted] = useState<Committed[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!address || !DESK_CONFIGURED) {
      setRows(null)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const mine = await fetchActiveStrategies(address)
      const out: DeskRow[] = []
      const tally = new Map<string, bigint>()

      for (const s of mine) {
        const tokens = [...s.tokens]
        if (tokens.length < 2) continue
        const [a, b] = await positionBalancesOrZero(address, s.hash, tokens[0], tokens[1], s.app)
        const [decA, decB] = [
          await tokenDecimals(tokens[0] as `0x${string}`),
          await tokenDecimals(tokens[1] as `0x${string}`),
        ]
        tally.set(tokens[0], (tally.get(tokens[0]) ?? 0n) + a)
        tally.set(tokens[1], (tally.get(tokens[1]) ?? 0n) + b)

        // Dikutip dari sisi token kedua ke token pertama, ukuran tetap.
        let quote: bigint | null = null
        try {
          quote = await quotePosition(
            s.app,
            s.strategy,
            tokens[1],
            tokens[0],
            QUOTE_UNITS * 10n ** BigInt(decB),
            address,
          )
        } catch {
          // Posisi yang sudah kosong menolak dikutip. Bukan galat halaman.
          quote = null
        }

        out.push({
          hash: s.hash,
          app: s.app,
          strategy: s.strategy,
          pair: `${codeOf(tokens[0])} / ${codeOf(tokens[1])}`,
          tokenIn: tokens[1],
          tokenOut: tokens[0],
          decIn: decB,
          decOut: decA,
          balances: [a, b],
          quote,
        })
      }
      setRows(out)

      const wallet = await readContracts(wagmiConfig as any, {
        contracts: [...tally.keys()].map((t) => ({
          address: t as Address,
          abi: erc20Abi,
          functionName: 'balanceOf' as const,
          args: [address],
          chainId: ACTIVE_CHAIN_ID,
        })),
      })
      const summary: Committed[] = []
      for (const [i, token] of [...tally.keys()].entries()) {
        const w = wallet[i]
        summary.push({
          token,
          code: codeOf(token),
          decimals: await tokenDecimals(token as `0x${string}`),
          real: w.status === 'success' ? (w.result as bigint) : 0n,
          committed: tally.get(token) ?? 0n,
        })
      }
      setCommitted(summary)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to read the desk.')
    } finally {
      setBusy(false)
    }
  }, [address])

  useEffect(() => {
    void load()
  }, [load])

  /** Berapa kali lipat modal nyata dipakai. Ini angka utamanya. */
  const efficiency = useMemo(() => {
    const best = committed
      .filter((c) => c.real > 0n)
      .map((c) => Number((c.committed * 100n) / c.real) / 100)
    return best.length ? Math.max(...best) : 0
  }, [committed])

  return (
    <div className="mx-auto w-full max-w-4xl px-5 pb-16 pt-8">
      <section className="space-y-5">
        <PageHeader
          title="Your desk"
          caption="The same capital quotes in several markets at once. In any AMM your capital is locked into one pool — in Aqua it never leaves your wallet, so it can work in many places."
        />

        {!address && (
          <Card>
            <CardContent>
              <p className="py-6 text-center text-sm text-zinc-500">
                Connect your wallet to see the desk.
              </p>
            </CardContent>
          </Card>
        )}

        {error && (
          <Card>
            <CardContent>
              <p className="py-4 text-center text-xs text-warn">{error}</p>
            </CardContent>
          </Card>
        )}

        {address && rows && rows.length > 0 && (
          <>
            <Card>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-end justify-between gap-6">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-spectral/60">
                      capital efficiency
                    </p>
                    <p className="font-display text-4xl font-medium text-spectral-soft">
                      {efficiency.toFixed(2)}×
                    </p>
                  </div>
                  <p className="max-w-md text-xs leading-relaxed text-zinc-500">
                    {rows.length} markets quoting from the same wallet. This is how many times over your real
                    capital is registered as liquidity.
                  </p>
                </div>

                <div className="space-y-1.5 border-t border-ink-800 pt-3">
                  {committed.map((c) => (
                    <div key={c.token} className="flex items-baseline justify-between gap-4 text-sm">
                      <span className="text-spectral/70">{c.code}</span>
                      <span className="font-mono tabular-nums text-zinc-400">
                        <span className="text-zinc-200">
                          {formatUnits(c.committed, c.decimals)}
                        </span>
                        <span className="text-zinc-600"> registered out of </span>
                        <span className="text-zinc-200">{formatUnits(c.real, c.decimals)}</span>
                        <span className="text-zinc-600"> nyata</span>
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex items-center justify-between">
                <CardTitle>Live quotes</CardTitle>
                <Button size="sm" variant="outline" loading={busy} onClick={() => void load()}>
                  Reload
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-xs leading-relaxed text-zinc-500">
                  The price for {String(QUOTE_UNITS)} units of the second token in each market. Swap in one
                  market and reload — the others move too, because they read the same
                  wallet.
                </p>
                {rows.map((r) => (
                  <div
                    key={r.hash}
                    className="flex flex-wrap items-baseline justify-between gap-3 rounded-xl border border-ink-800 bg-ink-900/40 p-3"
                  >
                    <div>
                      <span className="text-sm text-zinc-100">{r.pair}</span>
                      <span className="ml-2 font-mono text-[10px] text-zinc-600">
                        {r.hash.slice(0, 10)}
                      </span>
                    </div>
                    <span className="font-mono text-sm tabular-nums text-zinc-200">
                      {r.quote === null ? (
                        <span className="text-zinc-600">not quoting</span>
                      ) : (
                        <>
                          {String(QUOTE_UNITS)} {codeOf(r.tokenIn)}
                          <span className="text-zinc-600"> → </span>
                          {formatUnits(r.quote, r.decOut)} {codeOf(r.tokenOut)}
                        </>
                      )}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <p className="text-xs leading-relaxed text-zinc-500">
              Shared capital is not split evenly — it is competed for. Swappers who arrive later pay
              more because the backing has thinned, and a swap that is too large still fails.
              The hard limit is still there; only how it is announced changes.
            </p>
          </>
        )}

        {address && rows && rows.length === 0 && (
          <Card>
            <CardContent>
              <p className="py-6 text-center text-sm text-zinc-500">
                No positions yet. Open one from the Open position page, then open another on a
                different pair — the same capital will back both.
              </p>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  )
}

export default DeskPage
