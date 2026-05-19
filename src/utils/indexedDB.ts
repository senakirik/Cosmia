const DB_NAME    = 'cosmia'
const DB_VERSION = 1
const STORE      = 'tracks'

export interface StoredTrack {
  id?:    number
  name:   string
  artist: string
  tag:    string
  year:   string
  dur:    string
  blob:   Blob
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
      }
    }
    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result)
    req.onerror  = (e) => reject((e.target as IDBOpenDBRequest).error)
  })
}

export async function dbSaveTrack(track: Omit<StoredTrack, 'id'>): Promise<number> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readwrite')
    const req = tx.objectStore(STORE).add(track)
    req.onsuccess = () => resolve(req.result as number)
    req.onerror   = () => reject(req.error)
  })
}

export async function dbLoadAllTracks(): Promise<StoredTrack[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).getAll()
    req.onsuccess = () => resolve(req.result as StoredTrack[])
    req.onerror   = () => reject(req.error)
  })
}
