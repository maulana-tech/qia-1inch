import { useEffect, useState } from 'react'

import * as desk from '../lib/desk'
import { tokenDecimals } from '../lib/payments'
import { DESK_CONFIGURED } from '../lib/config'
import { parseAmountStrict } from '../lib/amount'

const DEBOUNCE_MS = 400

export interface DeskQuote {
  decIn: number
  decOut: number
  /** Jumlah yang dibayar, satuan dasar. */
  amountIn: bigint | null
  /** Jumlah yang akan diterima menurut rantai, satuan dasar. */
  amountOut: bigint | null
  loading: boolean
  error: string | null
}

/**
 * Kutipan dari rantai untuk jumlah yang ditulis pengguna.
 *
 * Sebelumnya harga di halaman Swap berasal dari CoinGecko. Itu harga pasar
 * dunia, bukan harga meja ini: keluaran sebenarnya dihitung kurva `x*y=k` dari
 * saldo maker yang nyata, dan pada kolam kecil selisihnya bisa puluhan persen.
 * Angka yang ditampilkan sekarang datang dari `quote()` — fungsi yang sama yang
 * dipakai `swap()`, jadi yang terlihat adalah yang akan terjadi.
 */
export function useDeskQuote(
  tokenIn: string,
  tokenOut: string,
  amount: string,
  taker?: string,
): DeskQuote {
  const [state, setState] = useState<DeskQuote>({
    decIn: 18,
    decOut: 18,
    amountIn: null,
    amountOut: null,
    loading: false,
    error: null,
  })

  useEffect(() => {
    let active = true
    if (!DESK_CONFIGURED || !tokenIn || !tokenOut || tokenIn === tokenOut) {
      setState((s) => ({ ...s, amountIn: null, amountOut: null, loading: false, error: null }))
      return
    }

    const timer = setTimeout(async () => {
      try {
        const [decIn, decOut] = await Promise.all([
          tokenDecimals(tokenIn as `0x${string}`),
          tokenDecimals(tokenOut as `0x${string}`),
        ])
        if (!active) return

        const amountIn = parseAmountStrict(amount, decIn)
        if (amountIn === null) {
          setState({ decIn, decOut, amountIn: null, amountOut: null, loading: false, error: null })
          return
        }

        setState((s) => ({ ...s, decIn, decOut, amountIn, loading: true, error: null }))
        const amountOut = await desk.quote(tokenIn, tokenOut, amountIn, taker)
        if (!active) return
        setState({ decIn, decOut, amountIn, amountOut, loading: false, error: null })
      } catch (e) {
        if (!active) return
        // Kolam yang terkuras menolak dikutip, dan itu jawaban yang berguna —
        // ditampilkan sebagai sebab, bukan sebagai angka kosong.
        setState((s) => ({
          ...s,
          amountOut: null,
          loading: false,
          error: e instanceof Error ? e.message : 'Meja tidak bisa mengutip jumlah ini.',
        }))
      }
    }, DEBOUNCE_MS)

    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [tokenIn, tokenOut, amount, taker])

  return state
}
