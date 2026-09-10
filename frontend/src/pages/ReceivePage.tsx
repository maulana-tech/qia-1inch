import { useMemo, useState } from 'react'
import { useAccount } from 'wagmi'
import { renderSVG } from 'uqr'

import { CHAIN_NAME } from '../lib/config'
import { ACTIVE_CHAIN_ID } from '../lib/wagmi'
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

  /**
   * QR-nya EIP-681, bukan alamat telanjang.
   *
   * `ethereum:0x…@11155111` memberi tahu dompet pemindainya dua hal sekaligus:
   * ke mana kirimannya, dan di RANTAI MANA. Alamat telanjang cuma memberi yang
   * pertama — dompet akan mengisi penerima lalu memakai rantai apa pun yang
   * sedang aktif, dan alamat EVM sah di semua rantai, jadi kirimannya tetap
   * "berhasil" ke tempat yang tidak bisa kamu ambil.
   *
   * Dompet yang tidak mengenal skema ini tetap membaca alamatnya dari dalam URI,
   * jadi tidak ada yang hilang dengan memakainya.
   */
  const uri = address ? `ethereum:${address}@${ACTIVE_CHAIN_ID}` : ''
  const qr = useMemo(() => (uri ? renderSVG(uri) : ''), [uri])

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
          caption={`Your wallet address on ${CHAIN_NAME}. Anyone can send tokens here.`}
        />

        <Card>
          <CardContent className="space-y-5">
            {address === undefined ? (
              <p className="py-6 text-center text-sm text-zinc-500">
                Connect your wallet to see your address.
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
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>

                <p className="text-xs leading-relaxed text-zinc-500">
                  If you want to ask for a specific amount, use the Payment link page — it
                  to create a link that pre-fills the amount for the payer.
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
