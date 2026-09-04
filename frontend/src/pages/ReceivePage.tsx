import { PageHeader } from '../components/ui'
import { Receive } from '../components/Receive'
import { useIqia } from '../hooks/useIqia'

export function ReceivePage() {
  const { receiveCode } = useIqia()
  return (
    <div className="mx-auto w-full max-w-2xl px-5 pb-16 pt-8">
      <section className="space-y-5">
        <PageHeader
          title="Receive"
          caption="Kode terimamu. Bagikan untuk dibayar; kode ini tidak membocorkan saldo maupun riwayat."
        />
        <Receive receiveCode={receiveCode} />
      </section>
    </div>
  )
}

export default ReceivePage
