import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAccount } from 'wagmi'
import { readContracts } from '@wagmi/core'
import { erc20Abi, formatUnits, type Address } from 'viem'

import { CURATED_TOKENS } from '../lib/tokens'
import { tokenDecimals } from '../lib/payments'
import { fetchActiveStrategies, type ActiveStrategy } from '../lib/markets'
import { closePosition, positionBalances } from '../lib/savings'
import { DESK_CONFIGURED, explorerContractUrl, explorerTxUrl } from '../lib/config'
import { wagmiConfig, ACTIVE_CHAIN_ID } from '../lib/wagmi'
import { Button, Card, CardContent, CardHeader, CardTitle, PageHeader } from '../components/ui'
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
}

export function PortfolioPage() {
  const { address } = useAccount()
  const [holdings, setHoldings] = useState<Holding[] | null>(null)
  const [positions, setPositions] = useState<Position[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [closing, setClosing] = useState<string | null>(null)
  const [closedTx, setClosedTx] = useState<`0x${string}` | null>(null)

  const load = useCallback(async () => {
    if (!address) {
      setHoldings(null)
      setPositions(null)
      return
    }
    setError(null)
    try {
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
          legs: [
            { code: codeOf(tokens[0]), decimals: await tokenDecimals(tokens[0] as `0x${string}`), balance: a },
            { code: codeOf(tokens[1]), decimals: await tokenDecimals(tokens[1] as `0x${string}`), balance: b },
          ],
        })
      }
      setPositions(withLegs)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal membaca portofolio.')
    }
  }, [address])

  useEffect(() => {
    void load()
  }, [load])

  const totalPositions = useMemo(() => positions?.length ?? 0, [positions])

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
      setError(e instanceof Error ? e.message : 'Gagal menutup posisi.')
    } finally {
      setClosing(null)
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-5 pb-16 pt-8">
      <section className="space-y-5">
        <PageHeader
          title="Portfolio"
          caption="Saldo dompetmu, dan modal yang sedang bekerja sebagai likuiditas di Aqua. Token yang bekerja TIDAK pindah ke mana pun — ia tetap terhitung di saldo dompetmu."
        />

        {!address && (
          <Card>
            <CardContent>
              <p className="py-6 text-center text-sm text-zinc-500">
                Hubungkan dompetmu untuk melihat portofolio.
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
            <Card>
              <CardHeader>
                <CardTitle>Saldo dompet</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {holdings === null ? (
                  <p className="py-3 text-center text-xs text-zinc-500">Membaca…</p>
                ) : holdings.length === 0 ? (
                  <p className="py-3 text-center text-xs text-zinc-500">
                    Belum ada token. Ambil token uji di halaman Faucet.
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
                <CardTitle>Posisi di Aqua ({totalPositions})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {positions === null ? (
                  <p className="py-3 text-center text-xs text-zinc-500">Membaca…</p>
                ) : positions.length === 0 ? (
                  <p className="py-3 text-center text-xs text-zinc-500">
                    Belum ada posisi terbuka. Mulai dari halaman Open position.
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
                        {closing === p.hash ? 'Menutup…' : 'Tutup posisi'}
                      </Button>
                    </div>
                  ))
                )}

                {closedTx && (
                  <p className="text-center text-xs text-patina-300">
                    Posisi ditutup ·{' '}
                    <a href={explorerTxUrl(closedTx)} target="_blank" rel="noreferrer" className="hover:underline">
                      lihat transaksi
                    </a>
                  </p>
                )}
                <p className="text-xs leading-relaxed text-zinc-500">
                  Menutup posisi tidak memindahkan token sama sekali — ia cuma menghapus catatan
                  alokasinya di Aqua. Saldo dompetmu tidak berubah.
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </section>
    </div>
  )
}

/** Simbol token dari registry, atau alamat pendek kalau tidak dikenal. */
function codeOf(address: string): string {
  const found = CURATED_TOKENS.find((t) => t.sac?.toLowerCase() === address.toLowerCase())
  return found?.code ?? `${address.slice(0, 6)}…${address.slice(-4)}`
}

export default PortfolioPage
