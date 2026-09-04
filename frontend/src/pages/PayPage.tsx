import { PageHeader } from '../components/ui'
import { Pay } from '../components/Pay'

export function PayPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 pb-16 pt-8">
      <section className="space-y-5">
        <PageHeader
          title="Pay"
          caption="Kirim ke pemegang lain di dalam kolam. Jumlah dan kedua pihak tetap tertutup."
        />
        <Pay embedded />
      </section>
    </div>
  )
}

export default PayPage
