import { apiClient } from './_client.js';
import { ensureOk } from './_http.js';
import { resolveApiBase } from '../config.js';

export interface UploadTokenBundle {
  token: string;
  key: string;
  uploadUrl: string;
  expiresAt: string;
}

export interface QiniuReturnBody {
  key: string;
  hash: string;
  size: number;
  width: number;
  height: number;
}

interface RequestTokensOpts {
  ext: string;
  count: number;
  collectionDraftId?: string;
}

interface UploadToQiniuOpts {
  token: string;
  key: string;
  uploadUrl: string;
  filePath: string;
}

export const uploadsService = {
  async requestTokens(opts: RequestTokensOpts): Promise<UploadTokenBundle[]> {
    const url = `${resolveApiBase()}/api/uploads/token`;
    const body: Record<string, unknown> = { ext: opts.ext, count: opts.count };
    if (opts.collectionDraftId) body.collectionDraftId = opts.collectionDraftId;
    const res = await apiClient.request<{ tokens: UploadTokenBundle[] }>({
      url,
      method: 'POST',
      data: body,
    });
    ensureOk('POST', url, res.statusCode, res.data);
    return res.data.tokens;
  },

  uploadToQiniu(opts: UploadToQiniuOpts): Promise<QiniuReturnBody> {
    return new Promise((resolveOk, reject) => {
      wx.uploadFile({
        url: opts.uploadUrl,
        filePath: opts.filePath,
        name: 'file',
        formData: { token: opts.token, key: opts.key },
        success: (res) => {
          if (res.statusCode !== 200) {
            reject(new Error(`Qiniu upload ${res.statusCode}`));
            return;
          }
          try {
            const parsed = JSON.parse(res.data) as QiniuReturnBody;
            if (!parsed.key) throw new Error('missing key in qiniu response');
            resolveOk(parsed);
          } catch (e) {
            reject(e);
          }
        },
        fail: reject,
      });
    });
  },
};
