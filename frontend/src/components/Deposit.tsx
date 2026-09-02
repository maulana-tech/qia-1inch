import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useIqia } from '../hooks/useIqia'
import { loadNotes, markSpent, type StoredNote } from '../lib/note-store'
import { formatAmount, isPositiveAmount, isValidAddress, truncateKey } from '../lib/format'
import { CHAIN_NAME, USE_MOCK, explorerTxUrl } from '../lib/config'
import { assetMeta, depositableTokens, resolveCustomToken, type TokenMeta } from '../lib/tokens'
import { cx } from '../lib/cx'
import { Button, Card, CheckIcon, PageIntro, ShieldIcon, Spinner, TextInput } from './ui'
import { CoinBadge } from './BrandIcons'

// ---------------------------------------------------------------------------
// The Deposit surface moves value between the public chain and the Iqia
// shielded pool, in either direction:
//   • deposit  = chain -> Iqia   (fund the pool, mint a note)
//   • withdraw = Iqia -> chain   (prove ownership in ZK, release the backing)
//
// Both directions are single-transaction. The cross-chain path that used to
// live here belonged to the old chain's bridge and was removed — see
// docs/migrasi.md.
// ---------------------------------------------------------------------------

type Direction = 'deposit' | 'withdraw'
type FlowStatus = 'idle' | 'running' | 'done' | 'error'

export interface DepositProgress {
  step: number
  total: number
  status: FlowStatus
}

const STEPS: Record<Direction, string[]> = {
  deposit: ['Submit on chain', 'Shielded note minted'],
  withdraw: ['Prove ownership (ZK)', 'Released on chain'],
}

function noteHuman(n: StoredNote): string {
  const decimals = n.decimals ?? 7
  const raw = BigInt(n.amount)
  const base = 10n ** BigInt(decimals)
  const whole = raw / base
  const frac = (raw % base).toString().padStart(decimals, '0').replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : `${whole}`
}

function StepRow({ label, state }: { label: string; state: 'pending' | 'active' | 'done' }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span
        className={cx(
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px]',
          state === 'done' && 'border-spectral/60 bg-spectral/15',
          state === 'active' && 'border-spectral/60',
          state === 'pending' && 'border-spectral/20',
        )}
      >
        {state === 'done' ? <CheckIcon className="h-3 w-3" /> : state === 'active' ? <Spinner className="h-3 w-3" /> : null}
      </span>
      <span className={cx('text-sm', state === 'pending' ? 'text-spectral/40' : 'text-spectral/90')}>{label}</span>
    </div>
  )
}

function TokenChip({ code }: { code: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <CoinBadge name={code} size="sm" />
      <span>{code}</span>
    </span>
  )
}

export function Deposit({
  embedded,
  onProgress,
}: { embedded?: boolean; onProgress?: (p: DepositProgress) => void } = {}) {
  const { sdk, refreshBalances } = useIqia()

  const [direction, setDirection] = useState<Direction>('deposit')
  const [amount, setAmount] = useState('')
  const [recipient, setRecipient] = useState('')
  const [status, setStatus] = useState<FlowStatus>('idle')
  const [step, setStep] = useState(0)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const tokens = useMemo(() => depositableTokens(), [])
  const [tokenCode, setTokenCode] = useState(tokens[0]?.code ?? 'ETH')
  const [customToken, setCustomToken] = useState<TokenMeta | null>(null)
  const [customAddress, setCustomAddress] = useState('')
  const [resolving, setResolving] = useState(false)

  const [notes, setNotes] = useState<StoredNote[]>([])
  const [selectedCommitment, setSelectedCommitment] = useState<string | null>(null)

  const cancelled = useRef(false)
  useEffect(() => () => { cancelled.current = true }, [])

  useEffect(() => {
    if (direction !== 'withdraw') return
    const unspent = loadNotes().filter((n) => !n.spent)
    setNotes(unspent)
    setSelectedCommitment((prev) => prev ?? unspent[0]?.commitment ?? null)
  }, [direction, status])

  const steps = STEPS[direction]
  useEffect(() => {
    onProgress?.({ step, total: steps.length, status })
  }, [step, steps.length, status, onProgress])

  const depositToken: TokenMeta =
    customToken ?? tokens.find((t) => t.code === tokenCode) ?? tokens[0] ?? assetMeta('ETH')

  const selectedNote = notes.find((n) => n.commitment === selectedCommitment) ?? null

  const canSubmit =
    status !== 'running' &&
    (direction === 'deposit'
      ? isPositiveAmount(amount)
      : Boolean(selectedNote) && isValidAddress(recipient))

  async function resolveCustom() {
    setError(null)
    setResolving(true)
    try {
      setCustomToken(await resolveCustomToken(customAddress))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resolve that token.')
    } finally {
      setResolving(false)
    }
  }

  async function run() {
    setError(null)
    setTxHash(null)
    setStatus('running')
    setStep(0)
    cancelled.current = false
    try {
      if (direction === 'deposit') {
        const { hash } = await sdk.deposit({
          asset: depositToken.code,
          amount,
          sac: depositToken.sac,
          decimals: depositToken.decimals,
          native: depositToken.native,
        })
        setTxHash(hash)
      } else {
        if (!selectedNote) throw new Error('No shielded note selected.')
        const { hash } = await sdk.withdraw({
          asset: selectedNote.assetCode,
          amount: noteHuman(selectedNote),
          recipient,
          commitment: selectedNote.commitment,
        })
        setTxHash(hash)
        if (!USE_MOCK) markSpent(selectedNote.commitment)
      }
      setStep(1)
      await refreshBalances()
      if (cancelled.current) return
      setStatus('done')
    } catch (err) {
      if (cancelled.current) return
      setError(err instanceof Error ? err.message : 'Transfer failed.')
      setStatus('error')
    }
  }

  const body: ReactNode = (
    <Card className="p-5">
      <div className="mb-5 flex gap-2">
        {(['deposit', 'withdraw'] as Direction[]).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => { setDirection(d); setStatus('idle'); setStep(0); setError(null); setTxHash(null) }}
            className={cx(
              'flex-1 rounded-md border px-3 py-2 text-sm capitalize transition-colors',
              direction === d ? 'border-spectral/60 bg-spectral/10' : 'border-spectral/15 hover:border-spectral/30',
            )}
          >
            {d}
          </button>
        ))}
      </div>

      {direction === 'deposit' ? (
        <div className="space-y-4">
          <div>
            <div className="coord-label mb-2">token</div>
            <div className="flex flex-wrap gap-2">
              {tokens.map((t) => (
                <button
                  key={t.code}
                  type="button"
                  onClick={() => { setTokenCode(t.code); setCustomToken(null) }}
                  className={cx(
                    'rounded-md border px-3 py-1.5 text-sm transition-colors',
                    !customToken && tokenCode === t.code
                      ? 'border-spectral/60 bg-spectral/10'
                      : 'border-spectral/15 hover:border-spectral/30',
                  )}
                >
                  <TokenChip code={t.code} />
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="coord-label mb-2">or a custom ERC20</div>
            <div className="flex gap-2">
              <TextInput
                mono
                placeholder="0x…"
                value={customAddress}
                onChange={(e) => setCustomAddress(e.currentTarget.value)}
              />
              <Button variant="ghost" disabled={resolving || !customAddress} onClick={resolveCustom}>
                {resolving ? <Spinner className="h-4 w-4" /> : 'Resolve'}
              </Button>
            </div>
            {customToken ? (
              <p className="mt-2 text-xs text-spectral/60">
                Using <TokenChip code={customToken.code} /> · {customToken.decimals} decimals
              </p>
            ) : null}
          </div>

          <div>
            <div className="coord-label mb-2">amount</div>
            <TextInput
              mono
              placeholder="0.0"
              value={amount}
              onChange={(e) => setAmount(e.currentTarget.value)}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <div className="coord-label mb-2">shielded note</div>
            {notes.length === 0 ? (
              <p className="text-sm text-spectral/50">No unspent notes yet. Deposit first.</p>
            ) : (
              <div className="space-y-1.5">
                {notes.map((n) => (
                  <button
                    key={n.commitment}
                    type="button"
                    onClick={() => setSelectedCommitment(n.commitment)}
                    className={cx(
                      'flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors',
                      selectedCommitment === n.commitment
                        ? 'border-spectral/60 bg-spectral/10'
                        : 'border-spectral/15 hover:border-spectral/30',
                    )}
                  >
                    <TokenChip code={n.assetCode} />
                    <span className="font-mono text-xs text-spectral/70">
                      {formatAmount(Number(noteHuman(n)))} · {truncateKey(n.commitment)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="coord-label mb-2">recipient on {CHAIN_NAME}</div>
            <TextInput
              mono
              placeholder="0x…"
              value={recipient}
              onChange={(e) => setRecipient(e.currentTarget.value)}
            />
            {recipient && !isValidAddress(recipient) ? (
              <p className="mt-2 text-xs text-rose-300/80">That is not a valid address.</p>
            ) : null}
          </div>
        </div>
      )}

      <div className="mt-5 border-t border-spectral/10 pt-4">
        {steps.map((label, i) => (
          <StepRow
            key={label}
            label={label}
            state={
              status === 'done' || i < step ? 'done' : status === 'running' && i === step ? 'active' : 'pending'
            }
          />
        ))}
      </div>

      {error ? <p className="mt-3 text-sm text-rose-300/90">{error}</p> : null}

      {txHash ? (
        <a
          className="mt-3 inline-block text-xs text-spectral/60 underline underline-offset-4 hover:text-spectral"
          href={explorerTxUrl(txHash)}
          target="_blank"
          rel="noreferrer"
        >
          View transaction ↗
        </a>
      ) : null}

      <Button className="mt-5 w-full" disabled={!canSubmit} onClick={run}>
        {status === 'running' ? (
          <Spinner className="h-4 w-4" />
        ) : (
          <>
            <ShieldIcon className="mr-2 h-4 w-4" />
            {direction === 'deposit' ? 'Shield' : 'Withdraw'}
          </>
        )}
      </Button>
    </Card>
  )

  if (embedded) return body

  return (
    <>
      <PageIntro
        title="Deposit"
        subtitle={`Move value between ${CHAIN_NAME} and the Iqia shielded pool. Every withdrawal is proven, not trusted.`}
      />
      {body}
    </>
  )
}

export default Deposit
