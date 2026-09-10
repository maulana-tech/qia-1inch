import { useEffect, useMemo, useState } from 'react'
import { useAccount } from 'wagmi'
import { renderSVG } from 'uqr'
import type { Address } from 'viem'

import { CHAIN_NAME } from '../lib/config'
import { ACTIVE_CHAIN_ID } from '../lib/wagmi'
import { buildEip681 } from '../lib/paymentLink'
import { parseAmountStrict } from '../lib/amount'
import { tokenDecimals } from '../lib/payments'
import { CURATED_TOKENS } from '../lib/tokens'
import { Button, Card, CardContent, Field, PageHeader, Select, TextInput } from '../components/ui'

/** Hanya token yang benar-benar ada di jaringan ini. */
const RECEIVABLE = CURATED_TOKENS.filter((t) => t.native || t.sac)

/**
 * Menerima token.
 *
 * # Kenapa halaman ini punya QR sendiri, terpisah dari Payment link
 *
 * Keduanya menghasilkan QR, dan sempat terlihat mubazir — halaman ini bahkan
 * pernah cuma menyuruh pengguna pindah ke Payment link kalau mau menyebut
 * nominal. Tapi dua QR itu untuk PEMINDAI yang berbeda:
 *
 *   - Di sini: `ethereum:…` (EIP-681). Dibaca MetaMask, Rainbow, Trust. Yang
 *     memindainya langsung mendapat layar kirim dompetnya sendiri, terisi.
 *     Tidak perlu browser, tidak perlu mengenal aplikasi ini.
 *   - Payment link: URL ke aplikasi ini. Yang memindainya membuka formulir kirim
 *     KITA — berguna kalau pembayarnya juga memakai aplikasi ini, dan satu-satunya
 *     yang bisa membawa label nama.
 *
 * Jadi yang perlu diperbaiki bukan menghapus salah satunya, tapi berhenti
 * membuat halaman ini setengah jadi. Sekarang ia bisa menyebut nominal juga.
 */
export function ReceivePage() {
  const { address } = useAccount()
  const [copied, setCopied] = useState(false)
  const [code, setCode] = useState('USDC')
  const [amount, setAmount] = useState('')
  const [decimals, setDecimals] = useState<number | null>(null)

  const token = RECEIVABLE.find((t) => t.code === code) ?? RECEIVABLE[0]

  useEffect(() => {
    let live = true
    void (async () => {
      const d = await tokenDecimals(token.native ? undefined : (token.sac as Address))
      if (live) setDecimals(d)
    })()
    return () => {
      live = false
    }
  }, [token])

  const value = decimals === null ? null : parseAmountStrict(amount, decimals)

  /**
   * Nominal yang mengecil jadi nol TIDAK diam-diam dibuang.
   *
   * "0.0000001" USDC itu angka yang sah dan nol pada 6 desimal. Tanpa
   * peringatan, QR-nya menjadi permintaan tanpa nominal, dan yang membuatnya
   * mengira sudah meminta sesuatu.
   */
  const roundsToZero = amount.trim() !== '' && decimals !== null && value === null

  const uri = useMemo(() => {
    if (!address) return ''
    try {
      return buildEip681({
        to: address,
        chainId: ACTIVE_CHAIN_ID,
        ...(token.native ? {} : { token: token.sac as string }),
        ...(value ? { amount: value } : {}),
      })
    } catch {
      return ''
    }
  }, [address, token, value])

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
          caption={`Your wallet address on ${CHAIN_NAME}. Show the code, or ask for a specific amount.`}
        />

        <Card>
          <CardContent className="space-y-5">
            {address === undefined ? (
              <p className="py-6 text-center text-sm text-zinc-500">
                Connect your wallet to see your address.
              </p>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Token">
                    <Select
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      options={RECEIVABLE.map((t) => ({ value: t.code, label: t.code }))}
                    />
                  </Field>
                  <Field label="Amount" hint="Leave empty to let the sender decide.">
                    <TextInput
                      mono
                      inputMode="decimal"
                      placeholder="0.00"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                  </Field>
                </div>

                {roundsToZero && (
                  <p className="text-xs text-warn">
                    That amount rounds to zero for {token.code}. The code below asks for no
                    specific amount.
                  </p>
                )}

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
                  This code is an <span className="font-mono">ethereum:</span> request that any
                  wallet can read — scanning it opens their own send screen, already filled in. If
                  you would rather send a link that opens this app, and carries a name, use the
                  Payment link page.
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
