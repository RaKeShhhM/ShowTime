const cache = new Map();

export const getOrSet = async (key, ttlMs, loader) => {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const value = await loader();
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
};
