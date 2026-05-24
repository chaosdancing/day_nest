export const storage = {
  get<T>(key: string): T | null {
    const v = wx.getStorageSync(key);
    if (v === '' || v === null || v === undefined) return null;
    return v as T;
  },
  set<T>(key: string, value: T): void {
    wx.setStorageSync(key, value);
  },
  remove(key: string): void {
    wx.removeStorageSync(key);
  },
  clear(): void {
    wx.clearStorageSync();
  },
};
