const TTL_MS = 10 * 60 * 1000; // 10 minutes

const store = new Map();

/**
 * Returns cached value for the given key, or undefined if missing/expired.
 */
function get(key) {
    const entry = store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
        store.delete(key);
        return undefined;
    }
    return entry.value;
}

/**
 * Stores a value under the given key for TTL_MS milliseconds.
 */
function set(key, value) {
    store.set(key, { value, expiresAt: Date.now() + TTL_MS });
}

/**
 * Returns how many entries are currently in the cache (including expired).
 */
function size() {
    return store.size;
}

module.exports = { get, set, size };