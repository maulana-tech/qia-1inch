import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { readContract, getBalance } from '@wagmi/core'
import { erc20Abi, formatUnits, getAddress, isAddress, parseUnits, type Address } from 'viem'

import { CURATED_TOKENS } from '../lib/tokens'
import { truncateKey } from '../lib/format'
import { explorerTxUrl } from '../lib/config'
import { wagmiConfig, ACTIVE_CHAIN_ID } from '../lib/wagmi'
import { parsePaymentLink, sendPayment, tokenDecimals } from '../lib/payments'
import { Button, Card, CardContent, Field, Select, TextInput } from './ui'
import { CoinBadge } from './BrandIcons'

/** Hanya token yang benar-benar bisa dikirim di jaringan ini. */
const SENDABLE = CURATED_TOKENS.filter((t) => t.native || t.sac)

export function Pay({ embedded }: { embedded?: boolean } = {}) {
  const { address: account } = useAccount()
  const { address: linkAddress } = useParams()
  const [search] = useSearchParams()

  const request = useMemo(() => parsePaymentLink(linkAddress, search), [linkAddress, search])
  /** Penerima dari link tidak bisa diubah — kalau bisa, link-nya kehilangan gunanya. */
  const locked = request !== null

  const [to, setTo] = useState(request?.address ?? '')
  const [code, setCode] = useState(request?.token ?? 'USDC')
  const [amount, setAmount] = useState(request?.amount ?? '')
  const [balance, setBalance] = useState<bigint | null>(null)
  /** Dibaca dari kontraknya, bukan dari registry — lihat `tokenDecimals`. */
  const [decimals, setDecimals] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [hash, setHash] = useState<`0x${string}` | null>(null)
  const [error, setError] = useState<string | null>(null)

  const token = SENDABLE.find((t) => t.code === code) ?? SENDABLE[0]

  useEffect(() => {
    if (!account) {
      setBalance(null)
      return
    }
    let live = true
    void (async () => {
      try {
        const dec = await tokenDecimals(token.native ? undefined : (token.sac as Address))
        if (live) setDecimals(dec)
        const value = token.native
          ? (await getBalance(wagmiConfig as any, { address: account, chainId: ACTIVE_CHAIN_ID })).value
          : ((await readContract(wagmiConfig as any, {
              address: token.sac as Address,
              abi: erc20Abi,
              functionName: 'balanceOf',
              chainId: ACTIVE_CHAIN_ID,
              args: [account],
            })) as bigint)
        if (live) setBalance(value)
      } catch {
        if (live) {
          setBalance(null)
          setDecimals(null)
        }
      }
    })()
    return () => {
      live = false
    }
  }, [account, token, hash])

  const recipientValid = isAddress(to)
  // Nominalnya diurai lebih dulu, bukan cuma dicek angkanya: "0.00000001" USDC
  // itu angka yang sah tapi nol pada 7 desimal, dan kirimannya jadi sia-sia.
  const value = useMemo(() => {
    if (decimals === null) return 0n
    try {
      return parseUnits(amount.trim() || '0', decimals)
    } catch {
      return 0n
    }
  }, [amount, decimals])
  const enough = balance === null || value <= balance
  const ready = Boolean(account) && recipientValid && value > 0n && enough && !busy

  async function onSend() {
    if (!account) return
    setBusy(true)
    setError(null)
    setHash(null)
    try {
      const tx = await sendPayment({
        account,
        to: getAddress(to),
        ...(token.native ? {} : { token: token.sac as Address }),
        amount: value,
      })
      setHash(tx)
      setAmount('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Pengiriman gagal.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={embedded ? 'space-y-5' : 'space-y-6'}>
      <Card className={embedded ? '' : 'mx-auto max-w-xl'}>
        <CardContent className="space-y-4">
          {locked ? (
            <div className="rounded-xl border border-ink-800 bg-ink-900/40 p-3">
              <p className="text-xs text-spectral/60">Bayar ke</p>
              {request?.name && (
                <p className="mt-1 text-sm font-medium text-zinc-100">{request.name}</p>
              )}
              <p className="mt-0.5 break-all font-mono text-xs text-zinc-400">{request?.address}</p>
            </div>
          ) : (
            <Field label="Alamat penerima" hint="Alamat dompet EVM biasa (0x…).">
              <TextInput
                mono
                placeholder="0x…"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </Field>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Field label="Token">
              <Select
                value={code}
                onChange={(e) => setCode(e.target.value)}
                options={SENDABLE.map((t) => ({ value: t.code, label: t.code }))}
              />
            </Field>
            <Field
              label="Jumlah"
              hint={
                balance === null
                  ? undefined
                  : `Saldo ${formatUnits(balance, decimals ?? 18)} ${token.code}`
              }
            >
              <TextInput
                mono
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-ink-800 bg-ink-900/40 p-3">
            <CoinBadge name={token.icon} size="lg" />
            <div className="min-w-0">
              <div className="text-sm font-semibold tracking-tight text-zinc-100">{token.code}</div>
              <div className="truncate text-xs text-zinc-400">{token.name}</div>
            </div>
          </div>

          {!account && (
            <p className="text-center text-xs text-zinc-500">Hubungkan dompetmu untuk mengirim.</p>
          )}
          {account && !enough && (
            <p className="text-center text-xs text-yellow-300">Saldomu kurang untuk jumlah ini.</p>
          )}
          {account && to !== '' && !recipientValid && (
            <p className="text-center text-xs text-yellow-300">Alamat penerimanya tidak valid.</p>
          )}

          <Button className="w-full" disabled={!ready} loading={busy} onClick={() => void onSend()}>
            {busy ? 'Mengirim…' : 'Kirim'}
          </Button>

          {hash && (
            <p className="text-center text-xs text-zinc-500">
              Terkirim ·{' '}
              <a
                href={explorerTxUrl(hash)}
                target="_blank"
                rel="noreferrer"
                className="text-spectral-soft hover:underline"
              >
                {truncateKey(hash, 6, 6)}
              </a>
            </p>
          )}
          {error && <p className="text-center text-xs text-yellow-300">{error}</p>}
        </CardContent>
      </Card>
    </div>
  )
}
