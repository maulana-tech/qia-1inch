import { useMemo, useState } from 'react'
import { useAccount } from 'wagmi'
import { renderSVG } from 'uqr'

import { CURATED_TOKENS } from '../lib/tokens'
import { ACTIVE_CHAIN_ID } from '../lib/wagmi'
import { buildPaymentLink } from '../lib/payments'
import { Button, Card, CardContent, Field, PageHeader, Select, TextInput } from '../components/ui'

const SENDABLE = CURATED_TOKENS.filter((t) => t.native || t.sac)

export function PaymentLinkPage() {
  const { address } = useAccount()
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [token, setToken] = useState('USDC')
  const [copied, setCopied] = useState(false)

  const link = useMemo(
    () =>
      address === undefined
        ? ''
        : buildPaymentLink({ address, name, amount, token, chainId: ACTIVE_CHAIN_ID }, window.location.origin),
    [address, name, amount, token],
  )
  const qr = useMemo(() => (link === '' ? '' : renderSVG(link)), [link])

  async function copy() {
    await navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-5 pb-16 pt-8">
      <section className="space-y-5">
        <PageHeader
          title="Payment link"
          caption="Create one link carrying your address and the amount you're asking for. The payer just opens it — the send form is already filled in."
        />

        <Card>
          <CardContent className="space-y-5">
            {address === undefined ? (
              <p className="py-6 text-center text-sm text-zinc-500">
                Connect your wallet to create a link.
              </p>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Name" hint="Shown to the payer.">
                    <TextInput
                      placeholder="Toko Kopi"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </Field>
                  <Field label="Token">
                    <Select
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      options={SENDABLE.map((t) => ({ value: t.code, label: t.code }))}
                    />
                  </Field>
                  <Field label="Amount" hint="Leave empty to let the payer fill it in.">
                    <TextInput
                      mono
                      inputMode="decimal"
                      placeholder="0.00"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                  </Field>
                </div>

                {/* Latarnya putih di tema mana pun — pemindai butuh modul gelap di atas terang. */}
                <div className="mx-auto w-fit rounded-2xl border border-ink-700 bg-white p-4">
                  <div className="h-52 w-52 [&_svg]:h-full [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: qr }} />
                </div>

                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate rounded-xl border border-ink-800 bg-ink-900/40 px-3 py-2 font-mono text-xs text-zinc-400">
                    {link}
                  </p>
                  <Button className="shrink-0" onClick={() => void copy()}>
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}

export default PaymentLinkPage
