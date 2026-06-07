import { toWxErrMsg } from './api.js';

export function wxLogin(): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.login({
      success: (r) => resolve(r.code),
      fail: (e) => reject(new Error(toWxErrMsg(e, 'wx.login 失败'))),
    });
  });
}

export function wxCheckSession(): Promise<boolean> {
  return new Promise((resolve) => {
    wx.checkSession({
      success: () => resolve(true),
      fail: () => resolve(false),
    });
  });
}

export function wxShowToast(title: string, icon: 'success' | 'error' | 'none' = 'none'): void {
  wx.showToast({ title, icon, duration: 1800 });
}
