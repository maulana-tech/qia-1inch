import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { fetchMarkets, fetchOneInchTokens, type Market, type TokenInfo } from '../lib/markets'
import { AQUA_CONFIGURED, CHAIN_NAME, SWAP_VM_ROUTER_ADDRESS, explorerContractUrl } from '../lib/config'
import { cx } from '../lib/cx'
import { tokenIconUrl } from '../lib/coinIcon'
import { Card, PageHeader, Spinner } from '../components/ui'

/** Jumlah dalam satuan dasar token, ditampilkan ringkas. */
function formatUnits(value: bigint, decimals: number): string {
  const base = 10n ** BigInt(decimals)
  const whole = value / base
  const frac = (value % base).toString().padStart(decimals, '0').slice(0, 4).replace(/0+$/, '')
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return frac ? `${grouped}.${frac}` : grouped
}

/**
 * Logo token: daftar 1inch dulu, lalu cryptoicons, lalu tiga huruf.
 *
 * Daftar 1inch didahulukan karena ia yang paling tahu token di rantai INI —
 * `logoURI`-nya menunjuk aset yang memang dipasangkan dengan alamat itu.
 * cryptoicons dicari berdasarkan simbol, dan simbol tidak unik antar rantai.
 */
function TokenGlyph({ token }: { token: TokenInfo }) {
  const [src, setSrc] = useState<string | null>(token.logoURI ?? tokenIconUrl(token.symbol))

  if (src === null) {
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full border border-spectral/20 text-[9px] text-spectral/70">
        {token.symbol.slice(0, 3)}
      </span>
    )
  }

  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      className="h-6 w-6 rounded-full"
      // Satu langkah mundur: kalau URL daftar 1inch gagal, coba cryptoicons;
      // kalau itu juga gagal, menyerah ke huruf. Tanpa penjaga `=== fallback`
      // ini akan berputar selamanya pada URL yang sama.
      onError={() => {
        const fallback = tokenIconUrl(token.symbol)
        setSrc(src === fallback ? null : fallback)
      }}
    />
  )
}

function MarketRow({ market }: { market: Market }) {
  return (
    <Link
      to={market.official ? '/app' : '/swap'}
      className="card block p-4 transition-shadow hover:ring-spectral/30"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
            {market.legs.map((leg) => (
              <TokenGlyph key={leg.address} token={leg} />
            ))}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-spectral/90">{market.pair}</span>
              {/* Asal likuiditasnya disebut terang-terangan. Menampilkan posisi
                  maker lain sebagai seolah milik meja kita akan menyesatkan. */}
              <span
                className={
                  market.official
                    ? 'rounded-full bg-spectral/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-spectral-soft'
                    : 'rounded-full bg-patina-500/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-patina-300'
                }
                title={
                  market.official
                    ? 'Liquidity on the official 1inch SwapVM router'
                    : 'Liquidity on the Iqia router'
                }
              >
                {market.official ? '1inch SwapVM' : 'iqia'}
              </span>
              {/* Posisi di router resmi bisa DIBACA tapi tidak bisa diisi dari
                  sini: programnya memuat instruksi yang panggilan dari dompet
                  biasa tidak bisa penuhi — `quote` pun ditolak. Menautkannya ke
                  halaman Swap akan menjanjikan sesuatu yang pasti gagal. */}
              {market.official && (
                <span
                  className="rounded-full bg-ink-700/60 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-zinc-400"
                  title="Another maker's position on the official router. Readable, but not fillable from this app."
                >
                  baca saja
                </span>
              )}
            </div>
            <div className="coord-label mt-0.5">
              maker {market.maker.slice(0, 6)}…{market.maker.slice(-4)}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-6">
          {market.legs.map((leg) => (
            <div key={leg.address} className="text-right">
              <div className="coord-label">{leg.symbol}</div>
              <div className="font-mono text-sm text-spectral/80">
                {formatUnits(leg.balance, leg.decimals)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Link>
  )
}

/** Satu angka pada baris statistik. */
function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="min-w-[7.5rem]">
      <div className="coord-label">{label}</div>
      <div className="mt-1.5 font-mono text-xl tabular-nums text-spectral/90">{value}</div>
    </div>
  )
}

export function Hub() {
  const [markets, setMarkets] = useState<Market[] | null>(null)
  const [tokens, setTokens] = useState<TokenInfo[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [live, listed] = await Promise.all([fetchMarkets(), fetchOneInchTokens()])
        if (cancelled) return
        setMarkets(live)
        setTokens(Object.values(listed))
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load markets.')
        setMarkets([])
      }
    })()
    return () => { cancelled = true }
  }, [])

  const totalLegs = useMemo(
    () => new Set((markets ?? []).flatMap((m) => m.legs.map((l) => l.address))).size,
    [markets],
  )

  return (
    <div className="mx-auto w-full max-w-5xl px-5 pb-16 pt-8">
      {/* Satu ritme vertikal untuk seluruh halaman.
          Dulu `space-y-5` di section DAN `mb-6` di baris statistik — keduanya
          menumpuk, jadi jarak caption→statistik 1,25rem sementara
          statistik→kartu 2,75rem. Bukan pilihan desain, cuma dua aturan yang
          kebetulan bertabrakan. */}
      <section className="space-y-8">
        <PageHeader
          title="Markets"
          caption={`Liquidity from 1inch Aqua on ${CHAIN_NAME}. Every market is backed by a market maker's wallet.`}
        />

        {/* Kolom dengan lebar minimum yang sama.
            Sebelumnya lebar tiap kolom ditentukan panjang labelnya, jadi
            angka-angkanya mendarat di jarak yang acak — "0" di bawah "token"
            dan "—" di bawah label lima kata. Terbaca seperti kecelakaan, bukan
            barisan angka. */}
        <div className="flex flex-wrap gap-x-12 gap-y-4">
          <Stat label="active markets" value={markets?.length ?? '—'} />
          <Stat label="tokens" value={markets ? totalLegs : '—'} />
          <Stat label="on the 1inch list" value={tokens.length || '—'} />
        </div>

        {markets === null ? (
          <Card className="flex items-center gap-3 p-6 text-sm text-spectral/60">
            <Spinner className="h-4 w-4" /> Reading markets from the chain…
          </Card>
        ) : error ? (
          <Card className="p-6 text-sm text-rose-300/90">{error}</Card>
        ) : markets.length > 0 ? (
          <div className="space-y-2">
            {markets.map((m) => (
              <MarketRow key={m.strategyHash} market={m} />
            ))}
          </div>
        ) : (
          <Card className="p-6 sm:p-7">
            {/* Baris pertama dinaikkan jadi judul sungguhan. Dulu ia `text-sm`
                sama persis dengan paragraf di bawahnya, jadi tidak ada hierarki
                — pembaca melihat dua kalimat setara, bukan judul dan
                penjelasannya. */}
            <h3 className="text-base font-medium text-spectral/85">No active markets yet.</h3>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-spectral/55">
              {AQUA_CONFIGURED
                ? 'The router is configured, but no position has been shipped to Aqua yet. Markets appear as soon as a market maker calls ship().'
                : 'The Aqua and router addresses are not set. Run script/DemoIqiaDesk.s.sol, then copy the env it prints into frontend/.env.local.'}
            </p>
            {AQUA_CONFIGURED ? (
              // `coord-label` itu gaya LABEL — mono 10px huruf besar dengan
              // tracking lebar. Sebagai tautan yang harus diklik ia terbaca
              // rapat dan sulit disasar; ukuran teks biasa lebih jujur soal
              // fungsinya.
              <a
                className="mt-5 inline-block text-sm text-spectral/70 underline underline-offset-4 transition hover:text-spectral/90"
                href={explorerContractUrl(SWAP_VM_ROUTER_ADDRESS)}
                target="_blank"
                rel="noreferrer"
              >
                View the router on the explorer ↗
              </a>
            ) : null}
          </Card>
        )}

        {tokens.length > 0 ? (
          <section className="pt-4">
            <div className="coord-label mb-4">tokens 1inch recognises on {CHAIN_NAME}</div>
            <div className="flex flex-wrap gap-2">
              {tokens.slice(0, 60).map((t) => (
                <span
                  key={t.address}
                  className={cx(
                    'inline-flex items-center gap-1.5 rounded-full border border-spectral/12 px-2.5 py-1 text-xs',
                    'text-spectral/70',
                  )}
                >
                  <TokenGlyph token={t} />
                  {t.symbol}
                </span>
              ))}
              {tokens.length > 60 ? (
                <span className="self-center text-xs text-spectral/40">
                  +{tokens.length - 60} more
                </span>
              ) : null}
            </div>
          </section>
        ) : null}
      </section>
    </div>
  )
}

export default Hub
