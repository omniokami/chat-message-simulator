import type { PersistStorage, StorageValue } from "zustand/middleware"

const DB_NAME = "chat-sim-db"
const STORE_NAME = "state"
const DB_VERSION = 1
const LEGACY_STORAGE_KEY = "chat-sim-storage"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const describePersistedValue = (value: StorageValue<unknown>) => {
  const persistedState = isRecord(value.state) ? value.state : null

  return {
    hasConversation: Boolean(persistedState?.conversation),
    hasBackgroundImageUrl: Boolean(persistedState?.backgroundImageUrl),
    hasBackgroundColor: Boolean(persistedState?.backgroundColor),
    hasBackgroundOpacity:
      persistedState !== null && "backgroundImageOpacity" in persistedState,
  }
}

const waitForTransaction = (transaction: IDBTransaction, message: string) =>
  new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => {
      console.error(message, transaction.error)
      reject(transaction.error ?? new Error(message))
    }
    transaction.onabort = () => {
      console.error(message, transaction.error)
      reject(transaction.error ?? new Error(message))
    }
  })

/**
 * IndexedDB-backed storage for Zustand persist middleware.
 * Stores parsed `StorageValue` objects directly instead of JSON strings.
 */
export const createIndexedDBStorage = (): PersistStorage<unknown> => {
  let dbPromise: Promise<IDBDatabase> | null = null
  let migrated = false

  const getDB = async (): Promise<IDBDatabase> => {
    if (dbPromise) return dbPromise

    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = () => {
        console.error("Failed to open IndexedDB:", request.error)
        reject(request.error ?? new Error("Failed to open IndexedDB"))
      }

      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME)
        }
      }

      request.onsuccess = () => {
        resolve(request.result)
      }
    })

    return dbPromise
  }

  const migrateFromLocalStorage = async (name: string): Promise<void> => {
    if (migrated || typeof localStorage === "undefined") return
    migrated = true

    try {
      const localStorageData = localStorage.getItem(LEGACY_STORAGE_KEY)
      if (!localStorageData) return

      const parsedData = JSON.parse(localStorageData) as StorageValue<unknown>
      const db = await getDB()
      const transaction = db.transaction([STORE_NAME], "readwrite")
      const store = transaction.objectStore(STORE_NAME)

      store.put(parsedData, name)
      await waitForTransaction(transaction, "Failed to migrate data to IndexedDB")
      localStorage.removeItem(LEGACY_STORAGE_KEY)
    } catch (error) {
      console.error("Migration from localStorage failed:", error)
    }
  }

  return {
    getItem: async (name) => {
      try {
        if (!migrated) {
          await migrateFromLocalStorage(name)
        }

        const db = await getDB()

        return await new Promise<StorageValue<unknown> | null>((resolve, reject) => {
          const transaction = db.transaction([STORE_NAME], "readonly")
          const store = transaction.objectStore(STORE_NAME)
          const request = store.get(name)

          request.onerror = () => {
            console.error("IndexedDB getItem error:", request.error)
            reject(request.error ?? new Error("IndexedDB getItem error"))
          }

          request.onsuccess = () => {
            const result = request.result
            if (result === undefined) {
              resolve(null)
              return
            }

            resolve(result as StorageValue<unknown>)
          }
        })
      } catch (error) {
        console.error("IndexedDB getItem error:", error)
        return null
      }
    },

    setItem: async (name, value) => {
      try {
        const db = await getDB()
        const transaction = db.transaction([STORE_NAME], "readwrite")
        const store = transaction.objectStore(STORE_NAME)

        store.put(value, name)
        await waitForTransaction(transaction, "IndexedDB setItem error")
        console.log(`Saved state to IndexedDB for key: ${name}`, describePersistedValue(value))
      } catch (error) {
        console.error("IndexedDB setItem error:", error)
        throw error
      }
    },

    removeItem: async (name) => {
      try {
        const db = await getDB()
        const transaction = db.transaction([STORE_NAME], "readwrite")
        const store = transaction.objectStore(STORE_NAME)

        store.delete(name)
        await waitForTransaction(transaction, "IndexedDB removeItem error")
      } catch (error) {
        console.error("IndexedDB removeItem error:", error)
      }
    },
  }
}
