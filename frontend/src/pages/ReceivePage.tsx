import { useMemo, useState } from 'react'
import { useAccount } from 'wagmi'
import { renderSVG } from 'uqr'

import { CHAIN_NAME } from '../lib/config'
import { Button, Card, CardContent, PageHeader } from '../components/ui'

/**
 * Menerima token: alamat dompet biasa, apa adanya.
 *
 * Dulu halaman ini menampilkan kode terima `wr1…` milik kolam terlindung. Kolam
 * itu sudah dibuang, dan kode yang tidak bisa dipakai siapa pun lebih buruk
 * daripada tidak ada halaman sama sekali.
 */
export function ReceivePage() {
  const { address } = useAccount()
  const [copied, setCopied] = useState(false)

  const qr = useMemo(() => (address ? renderSVG(address) : ''), [address])

  async function copy() {
    if (!address) return
    await navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-5 pb-16 pt-8">
      <section className="space-y-5">
        <PageHeader
          title="Receive"
          caption={`Alamat dompetmu di ${CHAIN_NAME}. Siapa pun bisa mengirim token ke sini.`}
        />

        <Card>
          <CardContent className="space-y-5">
            {address === undefined ? (
              <p className="py-6 text-center text-sm text-zinc-500">
                Hubungkan dompetmu untuk melihat alamatnya.
              </p>
            ) : (
              <>
                {/* Latarnya putih di tema mana pun — pemindai butuh modul gelap di atas terang. */}
                <div className="mx-auto w-fit rounded-2xl border border-ink-700 bg-white p-4">
                  <div
                    className="h-52 w-52 [&_svg]:h-full [&_svg]:w-full"
                    dangerouslySetInnerHTML={{ __html: qr }}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate rounded-xl border border-ink-800 bg-ink-900/40 px-3 py-2 font-mono text-xs text-zinc-400">
                    {address}
                  </p>
                  <Button className="shrink-0" onClick={() => void copy()}>
                    {copied ? 'Tersalin' : 'Salin'}
                  </Button>
                </div>

                <p className="text-xs leading-relaxed text-zinc-500">
                  Kalau kamu ingin meminta nominal tertentu, pakai halaman Payment link — ia
                  membuat tautan yang sudah mengisi jumlahnya untuk pembayar.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}

export default ReceivePage
