import { PageHeader } from '../components/ui'
import { Pay } from '../components/Pay'

export function PayPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-5 pb-16 pt-8">
      <section className="space-y-5">
        <PageHeader
          title="Pay"
          caption="Send tokens straight to any address. If you opened a payment link, the recipient and amount are already filled in."
        />
        <Pay embedded />
      </section>
    </div>
  )
}

export default PayPage
