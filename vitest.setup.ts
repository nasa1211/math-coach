// Node 25+ exposes an experimental global localStorage that shadows jsdom's and
// lacks clear()/setItem() unless a storage file is configured.
class MemoryStorage implements Storage {
  private data = new Map<string, string>();

  get length() {
    return this.data.size;
  }

  clear() {
    this.data.clear();
  }

  getItem(key: string) {
    return this.data.has(key) ? (this.data.get(key) as string) : null;
  }

  key(index: number) {
    return Array.from(this.data.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.data.delete(key);
  }

  setItem(key: string, value: string) {
    this.data.set(key, String(value));
  }
}

Object.defineProperty(globalThis, "Storage", {
  value: MemoryStorage,
  configurable: true,
  writable: true,
});

for (const name of ["localStorage", "sessionStorage"] as const) {
  Object.defineProperty(globalThis, name, {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  });
}
