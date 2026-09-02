import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { fetchMarkets, fetchOneInchTokens, type Market, type TokenInfo } from '../lib/markets'
import { AQUA_CONFIGURED, CHAIN_NAME, SWAP_VM_ROUTER_ADDRESS, explorerContractUrl } from '../lib/config'
import { cx } from '../lib/cx'
import { Card, PageIntro, Spinner } from '../components/ui'

/** Jumlah dalam satuan dasar token, ditampilkan ringkas. */
function formatUnits(value: bigint, decimals: number): string {
  const base = 10n ** BigInt(decimals)
  const whole = value / base
  const frac = (value % base).toString().padStart(decimals, '0').slice(0, 4).replace(/0+$/, '')
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return frac ? `${grouped}.${frac}` : grouped
}

function TokenGlyph({ token }: { token: TokenInfo }) {
  if (token.logoURI) {
    return <img src={token.logoURI} alt="" className="h-6 w-6 rounded-full" loading="lazy" />
  }
  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-full border border-spectral/20 text-[9px] text-spectral/70">
      {token.symbol.slice(0, 3)}
    </span>
  )
}

function MarketRow({ market }: { market: Market }) {
  return (
    <Link
      to="/swap"
      className="block rounded-lg border border-spectral/12 p-4 transition-colors hover:border-spectral/35"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
            {market.legs.map((leg) => (
              <TokenGlyph key={leg.address} token={leg} />
            ))}
          </div>
          <div>
            <div className="text-sm text-spectral/90">{market.pair}</div>
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
        setError(err instanceof Error ? err.message : 'Gagal memuat market.')
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
    <div className="mx-auto w-full max-w-5xl px-5 pb-16 pt-12">
      <PageIntro
        title="Markets"
        subtitle={`Likuiditas dari 1inch Aqua di ${CHAIN_NAME}. Setiap market ditopang dompet market maker — dananya tidak pernah terkunci di kontrak mana pun.`}
      />

      <div className="mb-6 flex flex-wrap items-center gap-x-8 gap-y-2">
        <div>
          <div className="coord-label">market aktif</div>
          <div className="font-mono text-lg text-spectral/90">{markets?.length ?? '—'}</div>
        </div>
        <div>
          <div className="coord-label">token</div>
          <div className="font-mono text-lg text-spectral/90">{markets ? totalLegs : '—'}</div>
        </div>
        <div>
          <div className="coord-label">dikenali daftar 1inch</div>
          <div className="font-mono text-lg text-spectral/90">{tokens.length || '—'}</div>
        </div>
      </div>

      {markets === null ? (
        <Card className="flex items-center gap-3 p-6 text-sm text-spectral/60">
          <Spinner className="h-4 w-4" /> Membaca market dari rantai…
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
        <Card className="p-6">
          <div className="text-sm text-spectral/80">Belum ada market aktif.</div>
          <p className="mt-2 text-sm text-spectral/55">
            {AQUA_CONFIGURED
              ? 'Router sudah dikonfigurasi, tapi belum ada posisi yang dikirim ke Aqua. Market muncul begitu seorang market maker memanggil ship().'
              : 'Alamat Aqua dan router belum diisi. Jalankan script/DemoIqiaDesk.s.sol, lalu salin env yang dicetaknya ke frontend/.env.local.'}
          </p>
          {AQUA_CONFIGURED ? (
            <a
              className="coord-label mt-4 inline-block underline underline-offset-4"
              href={explorerContractUrl(SWAP_VM_ROUTER_ADDRESS)}
              target="_blank"
              rel="noreferrer"
            >
              lihat router di explorer ↗
            </a>
          ) : null}
        </Card>
      )}

      {tokens.length > 0 ? (
        <section className="mt-12">
          <div className="coord-label mb-3">token yang dikenali 1inch di {CHAIN_NAME}</div>
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
                +{tokens.length - 60} lainnya
              </span>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  )
}

export default Hub
