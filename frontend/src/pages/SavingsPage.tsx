import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAccount } from 'wagmi'
import { PiggyBankIcon } from 'lucide-react'

import {
  closePosition,
  openPosition,
  positionBalances,
  savingsOrder,
  splitAmounts,
  strategyHashOf,
  walletBalances,
} from '../lib/savings'
import {
  AQUA_CONFIGURED,
  DESK_SURCHARGE_BPS,
  MOCK_USDC_ADDRESS,
  MOCK_WETH_ADDRESS,
  explorerTxUrl,
} from '../lib/config'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  PageIntro,
  Spinner,
} from '../components/ui'

/** Format satuan dasar jadi angka yang enak dibaca. */
function fmt(value: bigint, decimals: number): string {
  const base = 10n ** BigInt(decimals)
  const whole = (value / base).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const frac = (value % base).toString().padStart(decimals, '0').slice(0, 4).replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : whole
}

const TOKENS = [
  { symbol: 'WETH', address: MOCK_WETH_ADDRESS, decimals: 18 },
  { symbol: 'USDC', address: MOCK_USDC_ADDRESS, decimals: 6 },
] as const

const SALT = 1_000n

export function SavingsPage() {
  const { address } = useAccount()

  const [percent, setPercent] = useState(20)
  const [wallet, setWallet] = useState<[bigint, bigint]>([0n, 0n])
  const [position, setPosition] = useState<[bigint, bigint]>([0n, 0n])
  const [busy, setBusy] = useState<'open' | 'close' | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const configured = AQUA_CONFIGURED && Boolean(MOCK_WETH_ADDRESS) && Boolean(MOCK_USDC_ADDRESS)

  const strategyHash = useMemo(
    () => (address ? strategyHashOf(savingsOrder(address, SALT)) : null),
    [address],
  )

  const refresh = useCallback(async () => {
    if (!address || !configured || !strategyHash) {
      setLoading(false)
      return
    }
    try {
      const [w, p] = await Promise.all([
        walletBalances(address, TOKENS[0].address, TOKENS[1].address),
        positionBalances(address, strategyHash, TOKENS[0].address, TOKENS[1].address),
      ])
      setWallet(w)
      setPosition(p)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membaca saldo.')
    } finally {
      setLoading(false)
    }
  }, [address, configured, strategyHash])

  useEffect(() => { void refresh() }, [refresh])

  const isOpen = position[0] > 0n || position[1] > 0n
  const split = splitAmounts(wallet, percent)
  const canOpen = !isOpen && (split[0] > 0n || split[1] > 0n)

  async function handleOpen() {
    if (!address) return
    setBusy('open'); setError(null); setTxHash(null)
    try {
      const { hash } = await openPosition(
        address, TOKENS[0].address, TOKENS[1].address, split[0], split[1], SALT,
      )
      setTxHash(hash)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuka posisi.')
    } finally {
      setBusy(null)
    }
  }

  async function handleClose() {
    if (!address || !strategyHash) return
    setBusy('close'); setError(null); setTxHash(null)
    try {
      setTxHash(await closePosition(address, strategyHash, TOKENS[0].address, TOKENS[1].address))
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menutup posisi.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-5 pb-16 pt-10">
      <PageIntro
        title="Savings"
        subtitle="Sisihkan sebagian saldo jadi likuiditas. Uangnya tetap di dompetmu dan tetap bisa dibelanjakan — yang tercatat cuma izin."
      />

      {!configured ? (
        <Card className="p-6 text-sm text-spectral/60">
          Aqua belum dikonfigurasi. Jalankan <code>script/DemoIqiaDesk.s.sol</code>, lalu salin env
          yang dicetaknya ke <code>frontend/.env.local</code>.
        </Card>
      ) : !address ? (
        <Card className="p-6 text-sm text-spectral/60">Hubungkan dompet untuk mulai menabung.</Card>
      ) : loading ? (
        <Card className="flex items-center gap-3 p-6 text-sm text-spectral/60">
          <Spinner className="h-4 w-4" /> Membaca saldo…
        </Card>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Saldo dompet</CardTitle>
              <CardDescription>Yang bisa kamu sisihkan sekarang.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-8">
              {TOKENS.map((t, i) => (
                <div key={t.symbol}>
                  <div className="coord-label">{t.symbol}</div>
                  <div className="font-mono text-lg text-spectral/90">{fmt(wallet[i], t.decimals)}</div>
                </div>
              ))}
            </CardContent>
          </Card>

          {isOpen ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PiggyBankIcon className="h-4 w-4 text-spectral/70" />
                  Posisi aktif
                </CardTitle>
                <CardDescription>Likuiditas ini melayani swap dan mengumpulkan fee.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-8">
                {TOKENS.map((t, i) => (
                  <div key={t.symbol}>
                    <div className="coord-label">{t.symbol}</div>
                    <div className="font-mono text-lg text-spectral/90">{fmt(position[i], t.decimals)}</div>
                  </div>
                ))}
              </CardContent>
              <CardContent className="pt-0">
                <p className="text-sm text-spectral/55">
                  Token tetap di dompetmu — yang tercatat di Aqua cuma izin, jadi saldonya tidak
                  terkunci.
                </p>
                <Button className="mt-5" variant="ghost" disabled={busy !== null} onClick={handleClose}>
                  {busy === 'close' ? <Spinner className="h-4 w-4" /> : 'Tutup posisi'}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Berapa yang disisihkan</CardTitle>
                <CardDescription>Sisanya tetap bebas kamu belanjakan.</CardDescription>
              </CardHeader>
              <CardContent>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min={5}
                  max={80}
                  step={5}
                  value={percent}
                  onChange={(e) => setPercent(Number(e.currentTarget.value))}
                  className="h-1 flex-1 cursor-pointer appearance-none rounded bg-spectral/15 accent-spectral"
                />
                <span className="w-14 text-right font-mono text-lg text-spectral/90">{percent}%</span>
              </div>

              <div className="mt-5 flex flex-wrap gap-8 border-t border-spectral/10 pt-4">
                {TOKENS.map((t, i) => (
                  <div key={t.symbol}>
                    <div className="coord-label">{t.symbol} disisihkan</div>
                    <div className="font-mono text-lg text-spectral/90">{fmt(split[i], t.decimals)}</div>
                  </div>
                ))}
              </div>

              <Button className="mt-5 w-full" disabled={!canOpen || busy !== null} onClick={handleOpen}>
                {busy === 'open' ? <Spinner className="h-4 w-4" /> : 'Mulai menabung'}
              </Button>
              {!canOpen && !busy ? (
                <p className="mt-3 text-xs text-spectral/45">
                  Saldo dompetmu masih nol. Ambil token uji di halaman Deposit lebih dulu.
                </p>
              ) : null}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Yang perlu kamu tahu</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-sm text-spectral/55">
            <p>
              Menabung di sini tidak mengunci apa pun. Membuka posisi nol transfer token, dan
              menutupnya juga. Yang berpindah hanya saat ada orang menukar lewat posisimu.
            </p>
            <p className="mt-3">
              Karena saldonya bisa kamu belanjakan kapan saja, harga posisimu ikut menyesuaikan saat
              saldo menipis — biaya tambahan hingga {Number(DESK_SURCHARGE_BPS) / 1e7}% saat sandaran
              habis. Itu yang membuat posisinya tetap aman meski dompetmu berubah.
            </p>
            </CardContent>
          </Card>

          {error ? <Card className="p-4 text-sm text-rose-300/90">{error}</Card> : null}
          {txHash ? (
            <a
              className="inline-block text-xs text-spectral/60 underline underline-offset-4 hover:text-spectral"
              href={explorerTxUrl(txHash)}
              target="_blank"
              rel="noreferrer"
            >
              Lihat transaksi ↗
            </a>
          ) : null}
        </div>
      )}
    </div>
  )
}

export default SavingsPage
