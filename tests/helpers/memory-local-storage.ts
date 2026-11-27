/** In-memory localStorage for unit tests of zustand persist stores. Import before the store. */
export const memoryStorage = new Map<string, string>()
;(globalThis as { localStorage?: Storage }).localStorage = {
  getItem: key => memoryStorage.get(key) ?? null,
  setItem: (key, value) => { memoryStorage.set(key, String(value)) },
  removeItem: key => { memoryStorage.delete(key) },
  clear: () => memoryStorage.clear(),
  key: index => [...memoryStorage.keys()][index] ?? null,
  get length() { return memoryStorage.size },
} as Storage
