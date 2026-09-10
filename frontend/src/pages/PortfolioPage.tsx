import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAccount } from 'wagmi'
import { getBalance, readContracts } from '@wagmi/core'
import { erc20Abi, formatUnits, parseEther, type Address } from 'viem'

import { CURATED_TOKENS } from '../lib/tokens'
import { canWrapNative, tokenDecimals, unwrapNative, wrapNative } from '../lib/payments'
import { fetchActiveStrategies, fetchPositionTrades, type ActiveStrategy, type PositionTrade } from '../lib/markets'
import { closePosition, positionBalances } from '../lib/savings'
import { DESK_CONFIGURED, MOCK_WETH_ADDRESS, explorerContractUrl, explorerTxUrl } from '../lib/config'
import { wagmiConfig, ACTIVE_CHAIN_ID } from '../lib/wagmi'
import { Button, Card, CardContent, CardHeader, CardTitle, PageHeader, TextInput } from '../components/ui'
import { CoinBadge } from '../components/BrandIcons'

/**
 * Apa yang kamu punya: saldo dompet, dan posisi yang sedang bekerja di Aqua.
 *
 * Dulu halaman ini menampilkan catatan kolam terlindung. Kolam itu sudah
 * dibuang, dan angka-angka di sini sekarang dibaca langsung dari rantai —
 * saldo ERC20 dari kontrak tokennya, posisi dari registry Aqua.
 */
const HOLDINGS = CURATED_TOKENS.filter((t) => t.sac)

interface Holding {
  code: string
  icon: string
  address: string
  decimals: number
  balance: bigint
}

interface Position extends ActiveStrategy {
  legs: { code: string; decimals: number; balance: bigint }[]
  /** Alamat token per kaki, dibutuhkan `dock()`. */
  tokenAddresses: [string, string]
  /** Swap yang benar-benar lewat posisi ini. */
  trades: PositionTrade[]
}

export function PortfolioPage() {
  const { address } = useAccount()
  const [holdings, setHoldings] = useState<Holding[] | null>(null)
  const [positions, setPositions] = useState<Position[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [closing, setClosing] = useState<string | null>(null)
  const [closedTx, setClosedTx] = useState<`0x${string}` | null>(null)
  const [nativeBalance, setNativeBalance] = useState<bigint | null>(null)
  const [wrappable, setWrappable] = useState(false)
  const [wrapAmount, setWrapAmount] = useState('')
  const [wrapping, setWrapping] = useState<'wrap' | 'unwrap' | null>(null)
  const [wrapTx, setWrapTx] = useState<`0x${string}` | null>(null)

  const load = useCallback(async () => {
    if (!address) {
      setHoldings(null)
      setPositions(null)
      return
    }
    setError(null)
    try {
      setNativeBalance((await getBalance(wagmiConfig as any, { address, chainId: ACTIVE_CHAIN_ID })).value)
      setWrappable(await canWrapNative(MOCK_WETH_ADDRESS as Address))

      const results = await readContracts(wagmiConfig as any, {
        contracts: HOLDINGS.map((t) => ({
          address: t.sac as Address,
          abi: erc20Abi,
          functionName: 'balanceOf' as const,
          args: [address],
          chainId: ACTIVE_CHAIN_ID,
        })),
      })
      const rows: Holding[] = []
      for (const [i, t] of HOLDINGS.entries()) {
        const r = results[i]
        if (r.status !== 'success') continue
        rows.push({
          code: t.code,
          icon: t.icon,
          address: t.sac as string,
          // Desimal dari kontrak, bukan dari registry — lihat `tokenDecimals`.
          decimals: await tokenDecimals(t.sac as `0x${string}`),
          balance: r.result as bigint,
        })
      }
      setHoldings(rows)

      if (!DESK_CONFIGURED) {
        setPositions([])
        return
      }
      const mine = await fetchActiveStrategies(address)
      const withLegs: Position[] = []
      for (const s of mine) {
        const tokens = [...s.tokens]
        if (tokens.length < 2) continue
        const [a, b] = await positionBalances(address, s.hash, tokens[0], tokens[1])
        withLegs.push({
          ...s,
          tokenAddresses: [tokens[0], tokens[1]],
          trades: await fetchPositionTrades(s.hash),
          legs: [
            { code: codeOf(tokens[0]), decimals: await tokenDecimals(tokens[0] as `0x${string}`), balance: a },
            { code: codeOf(tokens[1]), decimals: await tokenDecimals(tokens[1] as `0x${string}`), balance: b },
          ],
        })
      }
      setPositions(withLegs)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to read your portfolio.')
    }
  }, [address])

  useEffect(() => {
    void load()
  }, [load])

  const totalPositions = useMemo(() => positions?.length ?? 0, [positions])

  /**
   * Membungkus ETH jadi WETH, dan sebaliknya.
   *
   * Ini yang paling dekat dengan "menaruh dana" di aplikasi ini. Bukan karena
   * ada kontrak yang menampung — tidak ada — tapi karena posisi Aqua dan swap
   * bekerja dengan ERC20 sementara orang memegang ETH. Tanpa langkah ini,
   * pemegang ETH di rantai sungguhan tidak bisa berbuat apa-apa.
   *
   * Di anvil kartunya tidak muncul: "WETH" di sana MockERC20 tanpa `deposit()`,
   * dan tokennya diambil dari Faucet.
   */
  async function doWrap(direction: 'wrap' | 'unwrap') {
    if (!address) return
    let amount: bigint
    try {
      amount = parseEther(wrapAmount.trim() || '0')
    } catch {
      setError('That amount is not valid.')
      return
    }
    if (amount === 0n) return

    setWrapping(direction); setError(null); setWrapTx(null)
    try {
      setWrapTx(
        direction === 'wrap'
          ? await wrapNative(address, MOCK_WETH_ADDRESS as Address, amount)
          : await unwrapNative(address, MOCK_WETH_ADDRESS as Address, amount),
      )
      setWrapAmount('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Wrapping failed.')
    } finally {
      setWrapping(null)
    }
  }

  /**
   * Menutup posisi dari tempat kamu melihatnya.
   *
   * Sebelumnya satu-satunya jalan menutup posisi ada di halaman Savings, dan ia
   * menutup posisi aktif PERTAMA apa pun isinya — termasuk posisi yang dibuka
   * lewat wizard strategi. Melihat daftar tanpa bisa berbuat apa-apa terhadapnya
   * adalah lubang, dan menutup posisi yang salah lebih buruk lagi.
   */
  async function close(p: Position) {
    if (!address) return
    setClosing(p.hash); setError(null); setClosedTx(null)
    try {
      setClosedTx(await closePosition(address, p.hash, p.tokenAddresses[0], p.tokenAddresses[1]))
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to close the position.')
    } finally {
      setClosing(null)
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-5 pb-16 pt-8">
      <section className="space-y-5">
        <PageHeader
          title="Portfolio"
          caption="Your wallet balances, and the capital currently working as liquidity in Aqua. Working tokens do NOT move anywhere — they still count towards your wallet balance."
        />

        {!address && (
          <Card>
            <CardContent>
              <p className="py-6 text-center text-sm text-zinc-500">
                Connect your wallet to see your portfolio.
              </p>
            </CardContent>
          </Card>
        )}

        {error && (
          <Card>
            <CardContent>
              <p className="py-4 text-center text-xs text-yellow-300">{error}</p>
            </CardContent>
          </Card>
        )}

        {address && (
          <>
            {wrappable && (
              <Card>
                <CardHeader>
                  <CardTitle>ETH ↔ WETH</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs leading-relaxed text-zinc-500">
                    Positions and swaps work in ERC20, and you are holding ETH. Wrapping
                    hands your funds to nobody — the WETH stays yours, in your wallet.
                  </p>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-spectral/60">ETH</span>
                    <span className="font-mono tabular-nums text-zinc-200">
                      {nativeBalance === null ? '—' : formatUnits(nativeBalance, 18)}
                    </span>
                  </div>
                  <TextInput
                    mono
                    inputMode="decimal"
                    placeholder="0.0"
                    value={wrapAmount}
                    onChange={(e) => setWrapAmount(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      disabled={wrapping !== null}
                      loading={wrapping === 'wrap'}
                      onClick={() => void doWrap('wrap')}
                    >
                      Bungkus jadi WETH
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1"
                      disabled={wrapping !== null}
                      loading={wrapping === 'unwrap'}
                      onClick={() => void doWrap('unwrap')}
                    >
                      Unwrap to ETH
                    </Button>
                  </div>
                  {wrapTx && (
                    <p className="text-center text-xs text-patina-300">
                      Selesai ·{' '}
                      <a href={explorerTxUrl(wrapTx)} target="_blank" rel="noreferrer" className="hover:underline">
                        lihat transaksi
                      </a>
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Wallet balances</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {holdings === null ? (
                  <p className="py-3 text-center text-xs text-zinc-500">Membaca…</p>
                ) : holdings.length === 0 ? (
                  <p className="py-3 text-center text-xs text-zinc-500">
                    No tokens yet. Grab test tokens on the Faucet page.
                  </p>
                ) : (
                  holdings.map((h) => (
                    <div
                      key={h.address}
                      className="flex items-center gap-3 rounded-xl border border-ink-800 bg-ink-900/40 p-3"
                    >
                      <CoinBadge name={h.icon} size="lg" />
                      <span className="text-sm font-semibold text-zinc-100">{h.code}</span>
                      <a
                        href={explorerContractUrl(h.address)}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate font-mono text-[10px] text-zinc-600 hover:text-zinc-400"
                      >
                        {h.address}
                      </a>
                      <span className="ml-auto font-mono text-sm tabular-nums text-zinc-200">
                        {formatUnits(h.balance, h.decimals)}
                      </span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Positions in Aqua ({totalPositions})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {positions === null ? (
                  <p className="py-3 text-center text-xs text-zinc-500">Membaca…</p>
                ) : positions.length === 0 ? (
                  <p className="py-3 text-center text-xs text-zinc-500">
                    No open positions yet. Start from the Open position page.
                  </p>
                ) : (
                  positions.map((p) => (
                    <div key={p.hash} className="rounded-xl border border-ink-800 bg-ink-900/40 p-3">
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-sm text-zinc-100">
                          {p.legs.map((l) => l.code).join(' / ')}
                        </span>
                        <div className="flex gap-5">
                          {p.legs.map((l) => (
                            <span key={l.code} className="text-right">
                              <span className="block text-[10px] uppercase tracking-[0.14em] text-spectral/60">
                                {l.code}
                              </span>
                              <span className="font-mono text-sm tabular-nums text-zinc-200">
                                {formatUnits(l.balance, l.decimals)}
                              </span>
                            </span>
                          ))}
                        </div>
                      </div>
                      {/* Pertanyaan pertama setiap market maker: ada yang menukar
                          lewat posisiku belum? Direkonstruksi dari event Pulled
                          dan Pushed milik Aqua. */}
                      <div className="mt-2 border-t border-ink-800 pt-2">
                        {p.trades.length === 0 ? (
                          <p className="text-xs text-zinc-600">
                            Nobody has swapped through this position yet.
                          </p>
                        ) : (
                          <>
                            <p className="text-[10px] uppercase tracking-[0.14em] text-spectral/60">
                              {p.trades.length} swaps through this position
                            </p>
                            <div className="mt-1 space-y-1">
                              {p.trades.slice(0, 3).map((t) => (
                                <div
                                  key={t.txHash}
                                  className="flex items-baseline justify-between gap-3 font-mono text-[11px] text-zinc-400"
                                >
                                  <span>
                                    +{formatUnits(t.amountIn, decimalsOf(p, t.tokenIn))}{' '}
                                    {codeOf(t.tokenIn)}
                                    <span className="text-zinc-600"> / </span>
                                    −{formatUnits(t.amountOut, decimalsOf(p, t.tokenOut))}{' '}
                                    {codeOf(t.tokenOut)}
                                  </span>
                                  <a
                                    href={explorerTxUrl(t.txHash as `0x${string}`)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-[10px] text-zinc-600 hover:text-zinc-400"
                                  >
                                    blok {String(t.blockNumber)}
                                  </a>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>

                      <p className="mt-1.5 break-all font-mono text-[10px] text-zinc-600">
                        {p.hash}
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2"
                        disabled={closing !== null}
                        loading={closing === p.hash}
                        onClick={() => void close(p)}
                      >
                        {closing === p.hash ? 'Closing…' : 'Close position'}
                      </Button>
                    </div>
                  ))
                )}

                {closedTx && (
                  <p className="text-center text-xs text-patina-300">
                    Position closed ·{' '}
                    <a href={explorerTxUrl(closedTx)} target="_blank" rel="noreferrer" className="hover:underline">
                      lihat transaksi
                    </a>
                  </p>
                )}
                <p className="text-xs leading-relaxed text-zinc-500">
                  Closing a position moves no tokens at all — it only removes the allocation
                  record in Aqua. Your wallet balance does not change.
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </section>
    </div>
  )
}

/** Desimal kaki posisi yang alamatnya cocok — sudah dibaca dari kontraknya. */
function decimalsOf(p: Position, token: string): number {
  const i = p.tokenAddresses.findIndex((a) => a.toLowerCase() === token.toLowerCase())
  return i >= 0 ? p.legs[i].decimals : 18
}

/** Simbol token dari registry, atau alamat pendek kalau tidak dikenal. */
function codeOf(address: string): string {
  const found = CURATED_TOKENS.find((t) => t.sac?.toLowerCase() === address.toLowerCase())
  return found?.code ?? `${address.slice(0, 6)}…${address.slice(-4)}`
}

export default PortfolioPage
