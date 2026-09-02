import { useEffect, useMemo, useRef } from 'react'
import { useIsDark } from '../hooks/useTheme'
import {
  createChart,
  CandlestickSeries,
  ColorType,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts'

// Adapted from Lotusfi/Lotus_main's AssetChart (lightweight-charts v5), recoloured
// to the Larel sepia/spectral DA. The shape is deterministic per market so the
// preview is stable; when a live reference price is known the whole series is
// rescaled so its last close sits on that price — the dark-pool testnet has no
// historical feed of its own.

function mockCandles(seed: string, anchor?: number, n = 90): CandlestickData[] {
  let s = 0
  for (let i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) >>> 0
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0xffffffff
  }
  const out: CandlestickData[] = []
  let price = 0.1 + rand() * 0.6
  const now = Math.floor(Date.now() / 1000)
  const step = 3600
  for (let i = n - 1; i >= 0; i--) {
    const open = price
    const close = Math.max(0.0001, price + (rand() - 0.5) * price * 0.07)
    const high = Math.max(open, close) * (1 + rand() * 0.02)
    const low = Math.min(open, close) * (1 - rand() * 0.02)
    out.push({ time: (now - i * step) as UTCTimestamp, open, high, low, close })
    price = close
  }
  if (anchor && anchor > 0 && out.length) {
    const scale = anchor / out[out.length - 1].close
    for (const c of out) {
      c.open *= scale
      c.high *= scale
      c.low *= scale
      c.close *= scale
    }
  }
  return out
}

export function PriceChart({ pair, price }: { pair: string; price?: number | null }) {
  const isDark = useIsDark()
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const candles = useMemo(() => mockCandles(pair, price ?? undefined), [pair, price])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const up     = isDark ? '#e0e0e0' : '#3a3a3a'
    const down   = isDark ? '#fca5a5' : '#dc2626'
    const text   = isDark ? '#888888' : '#666666'
    const grid   = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'
    const border = isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.09)'
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: text,
        fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: grid },
        horzLines: { color: grid },
      },
      rightPriceScale: { borderColor: border },
      timeScale: { borderColor: border, timeVisible: true, secondsVisible: false },
      crosshair: { mode: 0 },
    })
    chartRef.current = chart
    seriesRef.current = chart.addSeries(CandlestickSeries, {
      upColor: up,
      downColor: down,
      borderVisible: false,
      wickUpColor: up,
      wickDownColor: down,
    })
    return () => {
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
    }
  }, [isDark])

  useEffect(() => {
    const chart = chartRef.current
    const series = seriesRef.current
    if (!chart || !series) return
    series.setData(candles)
    chart.timeScale().fitContent()
  }, [candles, isDark])

  return <div ref={containerRef} className="h-full min-h-[260px] w-full" />
}

export default PriceChart
