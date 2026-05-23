export interface CompressResult {
  tempFilePath: string;
  width: number;
  height: number;
}

interface CompressOpts {
  src: string;
  longEdge?: number;
  quality?: number;
}

const DEFAULT_LONG_EDGE = 1600;
const DEFAULT_QUALITY = 75;

export function compressImage(opts: CompressOpts): Promise<CompressResult> {
  const longEdge = opts.longEdge ?? DEFAULT_LONG_EDGE;
  const quality = opts.quality ?? DEFAULT_QUALITY;
  return new Promise((resolveOk, reject) => {
    wx.getImageInfo({
      src: opts.src,
      success: (info) => {
        const { width, height } = scale(info.width, info.height, longEdge);
        wx.compressImage({
          src: opts.src,
          quality,
          compressedWidth: width,
          compressedHeight: height,
          success: (r) => resolveOk({
            tempFilePath: r.tempFilePath,
            width,
            height,
          }),
          fail: reject,
        });
      },
      fail: reject,
    });
  });
}

function scale(srcW: number, srcH: number, longEdge: number): { width: number; height: number } {
  const long = Math.max(srcW, srcH);
  if (long <= longEdge) return { width: srcW, height: srcH };
  const ratio = longEdge / long;
  return {
    width: Math.round(srcW * ratio),
    height: Math.round(srcH * ratio),
  };
}
