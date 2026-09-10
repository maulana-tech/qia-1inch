import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { readContract, getBalance } from '@wagmi/core'
import type { Config } from '@wagmi/core'
import { erc20Abi, formatUnits, getAddress, isAddress, type Address } from 'viem'

import { CURATED_TOKENS } from '../lib/tokens'
import { truncateKey } from '../lib/format'
import { cx } from '../lib/cx'
import { CHAIN_NAME, explorerTxUrl } from '../lib/config'
import { wagmiConfig, ACTIVE_CHAIN_ID } from '../lib/wagmi'
import { parsePaymentLink, sendPayment, tokenDecimals } from '../lib/payments'
import { parseAmountStrict } from '../lib/amount'
import { Button, Card, CardContent, Field, TextInput } from './ui'
import { TokenSelect } from './TokenSelect'

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

  /**
   * Token yang tidak dikenal TIDAK diganti diam-diam.
   *
   * Dulu `?? SENDABLE[0]`: link yang meminta DAI, dibuka di aplikasi yang tidak
   * mengenal DAI, akan memilih USDC tanpa sepatah kata pun. Pembayarnya menekan
   * Send dan mengirim aset yang salah ke alamat yang benar — dan itu tidak bisa
   * ditarik kembali.
   */
  const known = SENDABLE.find((t) => t.code === code)
  const token = known ?? SENDABLE[0]
  const unknownToken = request?.token !== undefined && known === undefined

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
          ? (await getBalance(wagmiConfig as Config, { address: account, chainId: ACTIVE_CHAIN_ID })).value
          : ((await readContract(wagmiConfig as Config, {
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
  /**
   * Nominalnya diurai lebih dulu, bukan cuma dicek angkanya: "0.00000001" USDC
   * itu angka yang sah tapi nol pada 6 desimal, dan kirimannya jadi sia-sia.
   *
   * `parseAmountStrict`, bukan `parseUnits` mentah: viem MEMBULATKAN desimal
   * berlebih ke ATAS, jadi mengetik 1.9999999 pada token 6 desimal mengirim dua
   * token penuh. Di halaman swap itu sudah buruk; di halaman kirim, aplikasinya
   * mengirim lebih banyak daripada yang diminta orangnya.
   */
  const value = useMemo(
    () => (decimals === null ? 0n : (parseAmountStrict(amount, decimals) ?? 0n)),
    [amount, decimals],
  )
  const enough = balance === null || value <= balance
  /**
   * Link dari rantai lain diblokir, bukan cuma diberi peringatan.
   *
   * Alamat EVM sah di setiap rantai, dan "USDC" di rantai lain adalah kontrak
   * yang sama sekali berbeda. Membiarkan Send tetap aktif berarti membiarkan
   * pembayaran berhasil ke aset yang salah.
   */
  const wrongChain = request?.chainId !== undefined && request.chainId !== ACTIVE_CHAIN_ID
  const ready =
    Boolean(account) && recipientValid && value > 0n && enough && !busy && !wrongChain && !unknownToken

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
      setError(e instanceof Error ? e.message : 'Sending failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={embedded ? 'space-y-5' : 'space-y-6'}>
      <Card className={cx('overflow-visible', embedded ? '' : 'mx-auto max-w-xl')}>
        <CardContent className="space-y-4">
          {locked ? (
            <div className="rounded-xl border border-ink-800 bg-ink-900/40 p-3">
              <p className="text-xs text-spectral/60">Pay to</p>
              {request?.name && (
                <p className="mt-1 text-sm font-medium text-zinc-100">{request.name}</p>
              )}
              <p className="mt-0.5 break-all font-mono text-xs text-zinc-400">{request?.address}</p>
            </div>
          ) : (
            <Field label="Recipient address" hint="An ordinary EVM wallet address (0x…).">
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
                  <TokenSelect
                    value={code}
                    onChange={setCode}
                    options={SENDABLE}
                    disabled={locked && request?.token !== undefined}
                  />
                </Field>
            <Field
              label="Amount"
              hint={
                balance === null
                  ? undefined
                  : `Balance ${formatUnits(balance, decimals ?? 18)} ${token.code}`
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

          {!account && (
            <p className="text-center text-xs text-zinc-500">Connect your wallet to send.</p>
          )}
          {account && !enough && (
            <p className="text-center text-xs text-warn">Your balance is short for this amount.</p>
          )}
          {account && to !== '' && !recipientValid && (
            <p className="text-center text-xs text-warn">That recipient address is not valid.</p>
          )}

          {/* Dua penolakan yang MEMATIKAN tombol Send, bukan sekadar memberi
              peringatan. Keduanya berakhir pada transfer yang berhasil ke aset
              yang salah, dan transfer tidak bisa ditarik kembali. */}
          {wrongChain && (
            <p className="text-center text-xs leading-relaxed text-danger">
              This link was created on another chain (id {request?.chainId}) and you are on{' '}
              {CHAIN_NAME}. The same address exists on every chain, but the token does not — paying
              from here would deliver the wrong asset.
            </p>
          )}
          {unknownToken && (
            <p className="text-center text-xs leading-relaxed text-danger">
              This link asks for {request?.token}, which this app has no address for. Sending a
              different token to that address is not something anyone can undo.
            </p>
          )}

          <Button className="w-full" disabled={!ready} loading={busy} onClick={() => void onSend()}>
            {busy ? 'Sending…' : 'Send'}
          </Button>

          {hash && (
            <p className="text-center text-xs text-zinc-500">
              Sent ·{' '}
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
          {error && <p className="text-center text-xs text-warn">{error}</p>}
        </CardContent>
      </Card>
    </div>
  )
}
