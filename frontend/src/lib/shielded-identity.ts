import { toField, type Field } from '@iqia/sdk'
import { signMessage } from '@wagmi/core'
import { wagmiConfig } from './wagmi'
import { peekCachedSpendingKey, randomSpendingKey, setActiveAddress, setSpendingKey } from './note-store'

const DERIVATION_MESSAGE = [
  'Iqia Shielded Wallet',
  '',
  'Sign to unlock your private spending key on this device.',
  'This signature stays in your browser and reveals nothing on-chain.',
  '',
  'Version: 1',
].join('\n')

export interface ShieldedIdentity {
  key: Field
  portable: boolean
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new Uint8Array(bytes))
  return new Uint8Array(digest)
}

function toBigIntBE(bytes: Uint8Array): bigint {
  let value = 0n
  for (const b of bytes) value = (value << 8n) | BigInt(b)
  return value
}

const inflight = new Map<string, Promise<ShieldedIdentity>>()

export function resolveShieldedIdentity(address: string): Promise<ShieldedIdentity> {
  const existing = inflight.get(address)
  if (existing) return existing

  const task = (async (): Promise<ShieldedIdentity> => {
    setActiveAddress(address)

    const cached = peekCachedSpendingKey(address)
    if (cached) {
      setSpendingKey(cached)
      return { key: cached, portable: true }
    }

    try {
      // Use Wagmi Core to sign message
      const signature = await signMessage(wagmiConfig as any, { message: DERIVATION_MESSAGE })
      const hashed = await sha256(new TextEncoder().encode(signature))
      const key = toField(toBigIntBE(hashed))
      setSpendingKey(key)
      return { key, portable: true }
    } catch (err) {
      console.warn('Wallet message-signing unavailable; using a browser-local shielded key.', err)
      const key = randomSpendingKey()
      setSpendingKey(key)
      return { key, portable: false }
    }
  })().finally(() => inflight.delete(address))

  inflight.set(address, task)
  return task
}
