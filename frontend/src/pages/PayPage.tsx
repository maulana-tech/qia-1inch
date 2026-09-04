import { PageHeader } from '../components/ui'
import { Pay } from '../components/Pay'

export function PayPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-5 pb-16 pt-8">
      <section className="space-y-5">
        <PageHeader
          title="Pay"
          caption="Kirim token langsung ke alamat mana pun. Kalau kamu membuka payment link, penerima dan nominalnya sudah terisi."
        />
        <Pay embedded />
      </section>
    </div>
  )
}

export default PayPage
