import { useEffect, useMemo, useRef, useState } from 'react'
import { useAccount } from 'wagmi'
import { readContracts, getBalance } from '@wagmi/core'
import type { Config } from '@wagmi/core'
import { erc20Abi, formatUnits, type Address } from 'viem'
import { CheckIcon, ChevronDownIcon } from 'lucide-react'

import { wagmiConfig, ACTIVE_CHAIN_ID } from '../lib/wagmi'
import { cx } from '../lib/cx'
import { CoinBadge } from './BrandIcons'

export interface TokenOption {
  code: string
  name: string
  icon: string
  native?: boolean
  /** Alamat ERC20; kosong untuk token asli rantai. */
  sac?: string
}

/**
 * Pemilih token.
 *
 * # Kenapa bukan `<select>` biasa
 *
 * `<option>` hanya menerima teks. Tidak ada ikon, tidak ada nama panjang, tidak
 * ada saldo — jadi halaman Pay dulu menampilkan `<select>` berisi "USDC" lalu
 * KARTU TERPISAH di bawahnya untuk memberi tahu token apa yang barusan dipilih.
 * Dua elemen untuk satu keputusan, dan yang kedua muncul setelah kamu memilih.
 *
 * # Saldo di dalam daftar, dan itu intinya
 *
 * Pertanyaan sebenarnya saat orang membuka pemilih token bukan "mana USDC" —
 * ia sudah tahu — melainkan "mana yang kupunya". Saldo semua token dibaca
 * sekali lewat multicall dan ditampilkan di barisnya masing-masing, jadi
 * jawabannya ada sebelum dipilih, bukan sesudahnya.
 *
 * Yang saldonya nol tetap ditampilkan, tidak disembunyikan: pemilih token yang
 * diam-diam menghilangkan pilihan membuat orang mengira aplikasinya rusak.
 */
export function TokenSelect({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string
  onChange: (code: string) => void
  options: TokenOption[]
  disabled?: boolean
}) {
  const { address } = useAccount()
  const [open, setOpen] = useState(false)
  const [balances, setBalances] = useState<Map<string, { amount: bigint; decimals: number }>>(
    new Map(),
  )
  const boxRef = useRef<HTMLDivElement>(null)

  const selected = options.find((o) => o.code === value) ?? options[0]

  // Menutup saat klik di luar atau Escape. Dropdown yang hanya bisa ditutup
  // dengan memilih sesuatu memaksa orang mengubah pilihannya untuk membatalkan.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => {
    if (!address) {
      setBalances(new Map())
      return
    }
    let live = true
    void (async () => {
      const erc20 = options.filter((o) => !o.native && o.sac)
      // Satu multicall untuk semua saldo dan desimalnya. Berurutan per token
      // berarti daftar yang terisi satu per satu di depan mata.
      const res = await readContracts(wagmiConfig as Config, {
        contracts: erc20.flatMap((o) => [
          {
            address: o.sac as Address,
            abi: erc20Abi,
            functionName: 'balanceOf' as const,
            args: [address],
            chainId: ACTIVE_CHAIN_ID,
          },
          {
            address: o.sac as Address,
            abi: erc20Abi,
            functionName: 'decimals' as const,
            chainId: ACTIVE_CHAIN_ID,
          },
        ]),
      })

      const next = new Map<string, { amount: bigint; decimals: number }>()
      erc20.forEach((o, i) => {
        const bal = res[i * 2]
        const dec = res[i * 2 + 1]
        // Pembacaan gagal dilewati, TIDAK dicatat sebagai nol. Nol berarti
        // "kamu tidak punya ini", dan itu kalimat yang tidak boleh diucapkan
        // aplikasi hanya karena satu panggilan RPC meleset.
        if (bal.status !== 'success' || dec.status !== 'success') return
        next.set(o.code, { amount: bal.result as bigint, decimals: Number(dec.result) })
      })

      const native = options.find((o) => o.native)
      if (native) {
        try {
          const b = await getBalance(wagmiConfig as Config, { address, chainId: ACTIVE_CHAIN_ID })
          next.set(native.code, { amount: b.value, decimals: b.decimals })
        } catch {
          /* dilewati, bukan dinolkan */
        }
      }
      if (live) setBalances(next)
    })()
    return () => {
      live = false
    }
  }, [address, options])

  const show = useMemo(
    () => (code: string) => {
      const b = balances.get(code)
      if (!b) return null
      const s = formatUnits(b.amount, b.decimals)
      const [whole, frac = ''] = s.split('.')
      const trimmed = frac.slice(0, 4).replace(/0+$/, '')
      return trimmed ? `${whole}.${trimmed}` : whole
    },
    [balances],
  )

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cx(
          'input flex w-full items-center gap-2.5 pr-9 text-left',
          disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        )}
      >
        <CoinBadge name={selected.icon} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-zinc-100">{selected.code}</span>
        </span>
        {show(selected.code) && (
          <span className="shrink-0 font-mono text-xs tabular-nums text-zinc-500">
            {show(selected.code)}
          </span>
        )}
        <ChevronDownIcon
          className={cx(
            'pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500 transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute z-30 mt-1.5 max-h-72 w-full overflow-auto rounded-xl border border-ink-700 bg-ink-850 p-1 shadow-panel"
        >
          {options.map((o) => {
            const active = o.code === selected.code
            const bal = show(o.code)
            return (
              <button
                key={o.code}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(o.code)
                  setOpen(false)
                }}
                className={cx(
                  'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition',
                  active ? 'bg-spectral/[0.08]' : 'hover:bg-spectral/[0.05]',
                )}
              >
                <CoinBadge name={o.icon} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-zinc-100">{o.code}</span>
                  <span className="block truncate text-xs text-zinc-500">{o.name}</span>
                </span>
                {bal !== null && (
                  <span className="shrink-0 font-mono text-xs tabular-nums text-zinc-400">
                    {bal}
                  </span>
                )}
                {active && <CheckIcon className="size-4 shrink-0 text-spectral/70" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default TokenSelect
