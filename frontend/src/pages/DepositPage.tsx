import { PageHeader } from '../components/ui'
import { useState } from 'react'
import { cx } from '../lib/cx'
import { Deposit, type DepositProgress } from '../components/Deposit'

/** Act 01 crossing droplet — a rule that fills as the deposit flow advances. */
function CrossingRule({ progress }: { progress: DepositProgress }) {
  const frac = progress.total > 1 ? progress.step / (progress.total - 1) : 0
  const pct = progress.status === 'done' ? 100 : Math.round(frac * 100)
  const lit = progress.status === 'running' || progress.status === 'done'
  return (
    <div className="mb-6">
      <div className="coord-label mb-2 flex justify-between">
        <span>public world</span>
        <span>shielded pool</span>
      </div>
      <div className="relative h-6">
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-spectral/12" />
        <div
          className="absolute left-0 top-1/2 h-px -translate-y-1/2 bg-spectral/60 transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
        <div className="absolute top-1/2 -translate-y-1/2 transition-all duration-700" style={{ left: `calc(${pct}% - 5px)` }}>
          <span
            className={cx(
              'block h-2.5 w-2.5 rounded-full transition-colors',
              lit ? 'bg-spectral shadow-[0_0_10px_2px_rgba(237,235,230,0.45)]' : 'bg-spectral/40',
            )}
          />
        </div>
      </div>
    </div>
  )
}

export function DepositPage() {
  const [cross, setCross] = useState<DepositProgress>({ step: 0, total: 2, status: 'idle' })
  return (
    <div className="mx-auto w-full max-w-2xl px-5 pb-16 pt-8">
      <section className="space-y-5">
        <PageHeader
          title="Deposit"
          caption="Pindahkan nilai antara dompet publik dan kolam. Setiap penarikan dijaga bukti, bukan kepercayaan."
        />
        <CrossingRule progress={cross} />
        <Deposit embedded onProgress={setCross} />
      </section>
    </div>
  )
}

export default DepositPage
