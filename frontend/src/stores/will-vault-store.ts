/**
 * Vault store — single source of truth for user-supplied facts about a will.
 * Dot-path getter/setter mirrors DivorceMate's vault-session but backed by
 * zustand + localStorage so it survives refreshes and can drive multiple
 * panels (intake, facts-panel, review page) without prop drilling.
 *
 * Keying: one store instance per willId. Call `useWillVault(willId)` at
 * the page entry point; downstream components use the returned hook.
 */

import { create, type StoreApi, type UseBoundStore } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { emptyVault, type WillVault, type VaultPath } from '@/types/will-vault'

interface VaultState {
  vault: WillVault
  setField: (path: VaultPath, value: unknown) => void
  getField: (path: VaultPath) => unknown
  replaceVault: (next: WillVault) => void
  reset: () => void
}

/** Walk a dot-path, creating intermediate objects/arrays as needed. */
function setByPath<T extends object>(obj: T, path: VaultPath, value: unknown): T {
  const parts = path.split('.')
  const clone: any = Array.isArray(obj) ? [...obj] : { ...obj }
  let cursor: any = clone
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]
    const nextKey = parts[i + 1]
    const nextIsIndex = /^\d+$/.test(nextKey)
    const existing = cursor[key]
    const fresh = nextIsIndex ? (Array.isArray(existing) ? [...existing] : []) : { ...(existing ?? {}) }
    cursor[key] = fresh
    cursor = fresh
  }
  cursor[parts[parts.length - 1]] = value
  return clone
}

function getByPath(obj: unknown, path: VaultPath): unknown {
  return path.split('.').reduce<any>((acc, key) => (acc == null ? acc : acc[key]), obj)
}

const stores = new Map<string, UseBoundStore<StoreApi<VaultState>>>()

/**
 * Return (or lazily create) the zustand hook for a given willId. Persist
 * key is scoped to the id so different wills don't collide.
 */
export function useWillVault(willId: string): UseBoundStore<StoreApi<VaultState>> {
  let hook = stores.get(willId)
  if (hook) return hook

  hook = create<VaultState>()(
    persist(
      (set, get) => ({
        vault: emptyVault,
        setField: (path, value) => set({ vault: setByPath(get().vault, path, value) as WillVault }),
        getField: (path) => getByPath(get().vault, path),
        replaceVault: (next) => set({ vault: next }),
        reset: () => set({ vault: emptyVault }),
      }),
      {
        name: `ezwill.vault.${willId}`,
        storage: createJSONStorage(() => (typeof window === 'undefined' ? dummyStorage : localStorage)),
      }
    )
  )
  stores.set(willId, hook)
  return hook
}

// SSR-safe noop storage.
const dummyStorage: Storage = {
  length: 0,
  clear: () => {},
  getItem: () => null,
  key: () => null,
  removeItem: () => {},
  setItem: () => {},
}

export { getByPath, setByPath }
