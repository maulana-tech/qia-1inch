import { useEffect, useRef, useState } from 'react'
import { useIqia } from '../hooks/useIqia'
import { useProofFlow } from '../hooks/useProofFlow'
import { usePriceQuote } from '../hooks/usePriceQuote'
import { formatAmount, formatPrice, parseAmount } from '../lib/format'
import type { OpenOrder, OrderSide } from '../lib/iqia-sdk'
import { TOKEN_OPTIONS, assetMeta } from '../lib/tokens'
import { cx } from '../lib/cx'
import { explorerTxUrl } from '../lib/config'
import {
  Badge,
  Button,
  Card,
  ChartIcon,
  ChevronDownIcon,
  Field,
  PageIntro,
  Select,
  ShieldIcon,
  TextInput,
  ToggleGroup,
  XIcon,
} from './ui'
import { ProofProgress } from './ProofProgress'
import { PriceChart } from './PriceChart'

function timeAgo(timestamp: number): string {
  const mins = Math.max(0, Math.round((Date.now() - timestamp) / 60000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  return `${hours}h ago`
}

// ── Open Orders table ──────────────────────────────────────────────────────

function OrderTableRow({
  order,
  canceling,
  onCancel,
}: {
  order: OpenOrder
  canceling: boolean
  onCancel: () => void
}) {
  const buy = order.side === 'buy'
  const filledNum = parseFloat(order.filled)
  const totalNum = parseFloat(order.amount)
  const fillPct = totalNum > 0 ? Math.round((filledNum / totalNum) * 100) : 0

  return (
    <tr className="group border-b border-ink-800 last:border-0 transition-colors hover:bg-ink-800/25">
      <td className="py-3 pl-5 pr-3">
        <Badge tone={buy ? 'accent' : 'neutral'} className="uppercase">
          {order.side}
        </Badge>
      </td>
      <td className="py-3 px-3">
        <span className="text-sm font-semibold text-zinc-100">{order.base}</span>
        <span className="mx-1 text-zinc-600">/</span>
        <span className="text-sm text-zinc-400">{order.quote}</span>
      </td>
      <td className="py-3 px-3 text-right font-mono text-sm tabular-nums text-zinc-100">
        {order.price}
        <span className="ml-1 text-xs text-zinc-500">{order.quote}</span>
      </td>
      <td className="py-3 px-3 text-right font-mono text-sm tabular-nums text-zinc-100">
        {order.amount}
        <span className="ml-1 text-xs text-zinc-500">{order.base}</span>
      </td>
      <td className="py-3 px-3">
        <div className="flex items-center justify-end gap-2">
          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-ink-700">
            <div
              className={cx(
                'h-full rounded-full transition-all',
                buy ? 'bg-spectral/60' : 'bg-zinc-500',
              )}
              style={{ width: `${fillPct}%` }}
            />
          </div>
          <span className="w-8 text-right font-mono text-xs tabular-nums text-zinc-400">
            {fillPct}%
          </span>
        </div>
      </td>
      <td className="py-3 px-3 text-right text-xs text-zinc-500">
        {timeAgo(order.createdAt)}
      </td>
      <td className="py-3 pl-3 pr-5 text-right">
        <Button variant="outline" size="sm" loading={canceling} onClick={onCancel}>
          Cancel
        </Button>
      </td>
    </tr>
  )
}

function OrderTableSkeleton() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <tr key={i} className="border-b border-ink-800 last:border-0">
          <td className="py-3.5 pl-5 pr-3">
            <div className="h-5 w-10 animate-pulse rounded-full bg-ink-700" />
          </td>
          <td className="py-3.5 px-3">
            <div className="h-3.5 w-20 animate-pulse rounded-none bg-ink-700" />
          </td>
          <td className="py-3.5 px-3">
            <div className="ml-auto h-3.5 w-14 animate-pulse rounded-none bg-ink-700" />
          </td>
          <td className="py-3.5 px-3">
            <div className="ml-auto h-3.5 w-14 animate-pulse rounded-none bg-ink-700" />
          </td>
          <td className="py-3.5 px-3">
            <div className="ml-auto h-3 w-20 animate-pulse rounded-full bg-ink-800" />
          </td>
          <td className="py-3.5 px-3">
            <div className="ml-auto h-3 w-12 animate-pulse rounded-none bg-ink-800" />
          </td>
          <td className="py-3.5 pl-3 pr-5">
            <div className="ml-auto h-7 w-14 animate-pulse rounded-none bg-ink-800" />
          </td>
        </tr>
      ))}
    </>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export function Swap({ embedded }: { embedded?: boolean } = {}) {
  const { sdk, orders, loadingOrders, refreshOrders, refreshBalances, history, loadingHistory, refreshHistory } = useIqia()
  const proof = useProofFlow()

  const [mode, setMode] = useState<'market' | 'limit'>('market')
  const [side, setSide] = useState<OrderSide>('buy')
  const [base, setBase] = useState('ETH')
  const [quote, setQuote] = useState('USDC')
  const [price, setPrice] = useState('')
  const [amount, setAmount] = useState('')
  const [cancelingId, setCancelingId] = useState<string | null>(null)
  const [showChart, setShowChart] = useState(true)
  const [ordersOpen, setOrdersOpen] = useState(true)
  const [bottomTab, setBottomTab] = useState<'orders' | 'history'>('orders')

  const { price: marketPrice, live: livePrice } = usePriceQuote(base, quote)
  const priceEdited = useRef(false)

  useEffect(() => {
    priceEdited.current = false
  }, [base, quote])

  useEffect(() => {
    if (marketPrice != null && !priceEdited.current && mode === 'limit') {
      setPrice(formatPrice(marketPrice))
    }
  }, [base, quote, marketPrice, mode])

  function onPriceChange(value: string) {
    priceEdited.current = true
    setPrice(value)
  }

  function useMarketPrice() {
    if (marketPrice == null) return
    priceEdited.current = false
    setPrice(formatPrice(marketPrice))
  }

  const effectivePrice = mode === 'market' ? (marketPrice ?? 0) : parseAmount(price)
  const valid = base !== quote && effectivePrice > 0 && parseAmount(amount) > 0
  const total = valid ? effectivePrice * parseAmount(amount) : 0

  async function onPlace() {
    if (mode === 'market') {
      const tokenIn = side === 'buy' ? quote : base
      const tokenOut = side === 'buy' ? base : quote
      const tokenInSac = assetMeta(tokenIn).sac ?? 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC'
      const tokenOutSac = assetMeta(tokenOut).sac ?? 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC'

      const amountIn = side === 'buy' ? total.toFixed(7) : amount
      const amountOut = side === 'buy' ? amount : total.toFixed(7)
      // Apply 10% slippage buffer for ZK commitment stability and pool depth accommodation
      const amountOutMin = (parseAmount(amountOut) * 0.90).toFixed(7)

      const result = await proof.run(() =>
        sdk.swapShielded({
          assetIn: tokenIn,
          assetOut: tokenOut,
          amountIn,
          amountOutMin,
          path: [tokenInSac, tokenOutSac],
        }),
      )
      if (result) {
        await refreshBalances()
        await refreshHistory()
      }
    } else {
      const result = await proof.run(() => sdk.placeOrder({ base, quote, side, price, amount }))
      if (result) {
        await refreshOrders()
        await refreshBalances()
        await refreshHistory()
      }
    }
  }

  function closeOverlay() {
    const succeeded = proof.status === 'done'
    proof.reset()
    if (succeeded) {
      setPrice('')
      setAmount('')
    }
  }

  async function onCancel(id: string) {
    setCancelingId(id)
    try {
      await sdk.cancelOrder(id)
      await refreshOrders()
      await refreshBalances()
      await refreshHistory()
    } finally {
      setCancelingId(null)
    }
  }

  return (
    <div className={embedded ? 'space-y-4' : 'space-y-6'}>
      {!embedded && (
        <PageIntro
          title="Swap"
          subtitle="Dark-pool DEX. Orders stay sealed until matched, so there is no front-running."
        />
      )}

      {/* ── Top row: Chart + Order form ───────────────────────────────── */}
      <div className="flex items-stretch gap-4">

        {/* ── Chart panel ────────────────────────────────────────────── */}
        <div
          className={cx(
            'hidden shrink-0 overflow-hidden transition-[width] duration-300 ease-out lg:flex lg:flex-col',
            showChart ? 'flex-1 min-w-0' : 'w-11',
          )}
        >
          {showChart ? (
            <Card className="flex h-full flex-col overflow-hidden p-0">
              {/* Market header bar */}
              <div className="flex items-center gap-3 border-b border-ink-700/60 px-5 py-3.5">
                {/* Pair */}
                <div className="flex items-baseline gap-1.5">
                  <span className="text-sm font-semibold text-zinc-100">{base}</span>
                  <span className="font-mono text-zinc-600">/</span>
                  <span className="text-sm text-zinc-400">{quote}</span>
                </div>

                {/* Divider */}
                <span className="h-4 w-px bg-ink-700" />

                {/* Price + live badge */}
                {marketPrice != null ? (
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-base font-semibold tabular-nums text-zinc-100">
                      {formatPrice(marketPrice)}
                    </span>
                    <span className="text-xs text-zinc-500">{quote}</span>
                    <span
                      className={cx(
                        'rounded-none px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em]',
                        livePrice
                          ? 'bg-spectral/10 text-spectral/80'
                          : 'bg-ink-800 text-zinc-600',
                      )}
                    >
                      {livePrice ? '● live' : 'est'}
                    </span>
                  </div>
                ) : (
                  <div className="h-4 w-24 animate-pulse rounded-none bg-ink-700" />
                )}

                {/* Hide chart button */}
                <button
                  type="button"
                  onClick={() => setShowChart(false)}
                  aria-label="Hide chart"
                  className="ml-auto flex h-7 w-7 items-center justify-center rounded-none text-zinc-600 transition hover:bg-ink-800 hover:text-zinc-300"
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Chart body */}
              <div className="min-h-[300px] flex-1 p-2">
                <PriceChart pair={`${base}/${quote}`} price={marketPrice} />
              </div>
            </Card>
          ) : (
            /* Collapsed chart strip */
            <button
              type="button"
              onClick={() => setShowChart(true)}
              aria-label="Show chart"
              className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-none border border-ink-700 bg-ink-900/40 py-4 transition hover:border-red-500"
            >
              <ChartIcon className="h-4 w-4 shrink-0 text-spectral/70" />
              <span className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500 rotate-180 [writing-mode:vertical-rl]">
                Chart
              </span>
            </button>
          )}
        </div>

        {/* ── Order form ─────────────────────────────────────────────── */}
        <div className="w-full shrink-0 lg:w-[22rem]">
          <Card className="flex h-full flex-col gap-0 p-0 overflow-hidden">

            {/* Form header */}
            <div className="flex items-center justify-between border-b border-ink-700/60 px-5 py-3.5">
              <div className="flex items-center gap-2">
                <ChartIcon className="h-4 w-4 text-zinc-500" />
                <h2 className="panel-title">{mode === 'market' ? 'Instant Swap' : 'Place order'}</h2>
              </div>
              {/* ZK privacy badge */}
              <div className="flex items-center gap-1.5 rounded-full border border-spectral/20 bg-spectral/10 px-2.5 py-1">
                <ShieldIcon className="h-3 w-3 text-spectral/70" />
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-spectral/70">
                  ZK sealed
                </span>
              </div>
            </div>

            {/* Form body */}
            <div className="flex flex-col gap-4 p-5">
              {/* Market / Limit toggle */}
              <ToggleGroup
                value={mode}
                onChange={(val) => {
                  setMode(val)
                  if (val === 'market' && marketPrice != null) {
                    setPrice(formatPrice(marketPrice))
                  }
                }}
                options={[
                  { value: 'market', label: 'Instant (Aqua desk)' },
                  { value: 'limit', label: 'Limit order' },
                ]}
              />

              {/* Buy / Sell toggle — prominent, semantic colors */}
              <ToggleGroup
                value={side}
                onChange={setSide}
                options={[
                  {
                    value: 'buy',
                    label: 'Buy',
                    activeClassName:
                      'bg-patina-300/15 text-patina-300 shadow-[inset_0_0_0_1px_rgba(214,197,124,0.35)]',
                  },
                  {
                    value: 'sell',
                    label: 'Sell',
                    activeClassName:
                      'bg-red-500/15 text-red-300 shadow-[inset_0_0_0_1px_rgba(239,68,68,0.3)]',
                  },
                ]}
              />

              {/* Token pair selectors */}
              <div className="grid grid-cols-2 gap-2.5">
                <Field label="Base asset">
                  <Select
                    value={base}
                    onChange={(e) => setBase(e.target.value)}
                    options={TOKEN_OPTIONS}
                  />
                </Field>
                <Field label="Quote asset">
                  <Select
                    value={quote}
                    onChange={(e) => setQuote(e.target.value)}
                    options={TOKEN_OPTIONS}
                  />
                </Field>
              </div>
              {base === quote && (
                <p className="-mt-1 text-xs text-spectral/80">Pick two different tokens.</p>
              )}

              {/* Price */}
              <Field
                label={mode === 'market' ? `Est. Price (${quote} per ${base})` : `Limit price (${quote} per ${base})`}
                hint={
                  mode === 'limit' && marketPrice != null ? (
                    <span className="flex items-center gap-1.5">
                      <span>
                        Market{' '}
                        <span className="font-mono tabular-nums text-zinc-300">
                          {formatPrice(marketPrice)}
                        </span>{' '}
                        {quote} · {livePrice ? 'live' : 'est'}
                      </span>
                      <button
                        type="button"
                        onClick={useMarketPrice}
                        className="font-mono text-spectral/80 transition hover:text-spectral"
                      >
                        use
                      </button>
                    </span>
                  ) : undefined
                }
              >
                <TextInput
                  mono
                  disabled={mode === 'market'}
                  inputMode="decimal"
                  placeholder="0.0000"
                  value={mode === 'market' ? (marketPrice != null ? formatPrice(marketPrice) : '...') : price}
                  onChange={(e) => onPriceChange(e.target.value)}
                />
              </Field>

              {/* Amount */}
              <Field label={`Amount (${base})`}>
                <TextInput
                  mono
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </Field>

              {/* Estimated total — styled as an inset info row */}
              <div className="flex items-center justify-between rounded-none border border-ink-700/50 bg-ink-900/50 px-4 py-3">
                <span className="text-xs text-zinc-500">
                  Est. {side === 'buy' ? 'cost' : 'proceeds'}
                </span>
                <span className="font-mono text-sm tabular-nums text-zinc-200">
                  {formatAmount(total)} {quote}
                </span>
              </div>

              {/* Place order CTA */}
              <Button
                className="w-full"
                disabled={!valid}
                onClick={() => void onPlace()}
              >
                {mode === 'market'
                  ? `Swap ${base} for ${quote}`
                  : (side === 'buy' ? `Buy ${base}` : `Sell ${base}`)}
              </Button>
            </div>
          </Card>
        </div>
      </div>

      {/* ── Bottom: Open orders & History (full-width, table layout) ────── */}
      <Card className="overflow-hidden p-0">
        {/* Section header with tabs */}
        <div className="flex items-center gap-6 border-b border-ink-700/60 px-5 py-2">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setBottomTab('orders')}
              className={cx(
                "pb-2.5 pt-3 text-sm font-semibold border-b-2 transition-colors",
                bottomTab === 'orders'
                  ? "border-spectral text-zinc-100"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"
              )}
            >
              Open orders ({orders.length})
            </button>
            <button
              type="button"
              onClick={() => setBottomTab('history')}
              className={cx(
                "pb-2.5 pt-3 text-sm font-semibold border-b-2 transition-colors",
                bottomTab === 'history'
                  ? "border-spectral text-zinc-100"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"
              )}
            >
              History ({history.length})
            </button>
          </div>

          <button
            type="button"
            onClick={() => setOrdersOpen((v) => !v)}
            aria-label={ordersOpen ? 'Collapse panel' : 'Expand panel'}
            className="ml-auto flex h-7 w-7 items-center justify-center rounded-none text-zinc-600 transition hover:bg-ink-800 hover:text-zinc-300"
          >
            <ChevronDownIcon
              className={cx(
                'h-4 w-4 transition-transform duration-200',
                ordersOpen ? '' : '-rotate-90',
              )}
            />
          </button>
        </div>

        {/* Panel content */}
        {ordersOpen && (
          <div className="overflow-x-auto">
            {bottomTab === 'orders' ? (
              loadingOrders ? (
                <table className="w-full">
                  <tbody>
                    <OrderTableSkeleton />
                  </tbody>
                </table>
              ) : orders.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
                  <ChartIcon className="h-8 w-8 text-zinc-700" />
                  <p className="text-sm text-zinc-500">No open orders.</p>
                  <p className="text-xs text-zinc-600">Place an order above to get started.</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-ink-800">
                      <th className="py-2.5 pl-5 pr-3 text-left font-mono text-[10px] uppercase tracking-wider text-zinc-600">
                        Side
                      </th>
                      <th className="py-2.5 px-3 text-left font-mono text-[10px] uppercase tracking-wider text-zinc-600">
                        Pair
                      </th>
                      <th className="py-2.5 px-3 text-right font-mono text-[10px] uppercase tracking-wider text-zinc-600">
                        Price
                      </th>
                      <th className="py-2.5 px-3 text-right font-mono text-[10px] uppercase tracking-wider text-zinc-600">
                        Amount
                      </th>
                      <th className="py-2.5 px-3 text-right font-mono text-[10px] uppercase tracking-wider text-zinc-600">
                        Filled
                      </th>
                      <th className="py-2.5 px-3 text-right font-mono text-[10px] uppercase tracking-wider text-zinc-600">
                        Time
                      </th>
                      <th className="py-2.5 pl-3 pr-5 text-right font-mono text-[10px] uppercase tracking-wider text-zinc-600">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => (
                      <OrderTableRow
                        key={order.id}
                        order={order}
                        canceling={cancelingId === order.id}
                        onCancel={() => void onCancel(order.id)}
                      />
                    ))}
                  </tbody>
                </table>
              )
            ) : (
              // History Tab
              loadingHistory ? (
                <table className="w-full">
                  <tbody>
                    <OrderTableSkeleton />
                  </tbody>
                </table>
              ) : history.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
                  <ChartIcon className="h-8 w-8 text-zinc-700" />
                  <p className="text-sm text-zinc-500">No transaction history.</p>
                  <p className="text-xs text-zinc-600">Swap, deposit, or place orders to build history.</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-ink-800">
                      <th className="py-2.5 pl-5 pr-3 text-left font-mono text-[10px] uppercase tracking-wider text-zinc-600">
                        Type
                      </th>
                      <th className="py-2.5 px-3 text-left font-mono text-[10px] uppercase tracking-wider text-zinc-600">
                        Asset/Pair
                      </th>
                      <th className="py-2.5 px-3 text-right font-mono text-[10px] uppercase tracking-wider text-zinc-600">
                        Spent
                      </th>
                      <th className="py-2.5 px-3 text-right font-mono text-[10px] uppercase tracking-wider text-zinc-600">
                        Received
                      </th>
                      <th className="py-2.5 px-3 text-right font-mono text-[10px] uppercase tracking-wider text-zinc-600">
                        Time
                      </th>
                      <th className="py-2.5 pl-3 pr-5 text-right font-mono text-[10px] uppercase tracking-wider text-zinc-600">
                        Transaction
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((item) => (
                      <tr key={item.id} className="border-b border-ink-800 last:border-0 hover:bg-ink-800/25 transition-colors">
                        <td className="py-3.5 pl-5 pr-3 text-left">
                          <span className={cx(
                            "rounded-none px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider",
                            item.type === 'Swap' && "bg-blue-500/10 text-blue-400",
                            item.type === 'Deposit' && "bg-green-500/10 text-green-400",
                            item.type === 'Withdrawal' && "bg-yellow-500/10 text-yellow-400",
                            item.type.includes('Filled') && "bg-emerald-500/10 text-emerald-400",
                            item.type.includes('Cancelled') && "bg-zinc-800 text-zinc-400"
                          )}>
                            {item.type}
                          </span>
                        </td>
                        <td className="py-3.5 px-3 text-left text-sm font-semibold text-zinc-100">
                          {item.pairOrAsset}
                        </td>
                        <td className="py-3.5 px-3 text-right font-mono text-sm text-red-400 font-semibold">
                          {item.amountIn ? `-${item.amountIn}` : '—'}
                        </td>
                        <td className="py-3.5 px-3 text-right font-mono text-sm text-green-400 font-semibold">
                          {item.amountOut ? `+${item.amountOut}` : '—'}
                        </td>
                        <td className="py-3.5 px-3 text-right font-mono text-xs text-zinc-400">
                          {timeAgo(item.createdAt)}
                        </td>
                        <td className="py-3.5 pl-3 pr-5 text-right">
                          {item.txHash ? (
                            <a
                              href={explorerTxUrl(item.txHash)}
                              target="_blank"
                              rel="noreferrer"
                              className="font-mono text-xs text-zinc-500 hover:text-spectral underline transition"
                            >
                              {item.txHash.slice(0, 8)}...
                            </a>
                          ) : (
                            <span className="font-mono text-xs text-zinc-700">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}
          </div>
        )}
      </Card>

      <ProofProgress
        flow={proof}
        title={mode === 'market' ? "Routing through the Aqua desk" : "Placing order"}
        subject={parseAmount(amount) > 0 ? `${amount} ${base}` : undefined}
        onClose={closeOverlay}
      />
    </div>
  )
}
