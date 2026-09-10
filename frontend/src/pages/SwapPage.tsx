import { PageHeader } from '../components/ui'
import { Swap } from '../components/Swap'

export function SwapPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-5 pb-16 pt-8">
      <section className="space-y-5">
        <PageHeader
          title="Swap"
          caption="Trade straight against a market maker's wallet via 1inch Aqua. The price is computed by a bytecode program inside SwapVM."
        />
        <Swap embedded />
      </section>
    </div>
  )
}

export default SwapPage
