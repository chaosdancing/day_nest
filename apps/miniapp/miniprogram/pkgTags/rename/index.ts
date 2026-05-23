import type { TagDTO } from '@daynest/shared';
import { tagsService } from '../../lib/services/tags.js';
import { normalizeTagName } from '../../lib/tagName.js';

interface PageData {
  tagName: string;
  originalDisplay: string;
  originalNormalized: string;
  newDisplay: string;
  newNormalized: string;
  collisionDisplay: string;
  canSubmit: boolean;
  submitting: boolean;
  allTags: TagDTO[];
}

Page({
  data: {
    tagName: '',
    originalDisplay: '',
    originalNormalized: '',
    newDisplay: '',
    newNormalized: '',
    collisionDisplay: '',
    canSubmit: false,
    submitting: false,
    allTags: [],
  } as PageData,

  async onLoad(query: Record<string, string | undefined>) {
    const tag = decodeURIComponent(query.tag ?? '');
    const display = decodeURIComponent(query.display ?? tag);
    if (!tag) {
      wx.showToast({ title: '缺少标签名', icon: 'none' });
      return;
    }
    this.setData({
      tagName: tag,
      originalDisplay: display,
      originalNormalized: normalizeTagName(display),
      newDisplay: display,
      newNormalized: normalizeTagName(display),
    });
    this.recomputeCollision();
    // Preload the tag list so we can detect a merge collision client-side.
    try {
      const tags = await tagsService.list();
      this.setData({ allTags: tags });
      this.recomputeCollision();
    } catch {
      // Non-fatal — the api still enforces the merge on the server.
    }
  },

  onInput(e: WechatMiniprogram.Input) {
    const v = e.detail.value;
    this.setData({
      newDisplay: v,
      newNormalized: normalizeTagName(v),
    });
    this.recomputeCollision();
  },

  recomputeCollision() {
    const { newNormalized, originalNormalized, allTags } = this.data;
    const trimmed = newNormalized.trim();
    const sameAsOriginal = trimmed === originalNormalized;
    let collisionDisplay = '';
    if (trimmed && !sameAsOriginal) {
      const hit = allTags.find((t) => t.name === trimmed);
      collisionDisplay = hit ? hit.displayName : '';
    }
    this.setData({
      collisionDisplay,
      canSubmit: trimmed.length > 0 && this.data.newDisplay.trim().length > 0,
    });
  },

  async onSubmit() {
    if (!this.data.canSubmit || this.data.submitting) return;
    const display = this.data.newDisplay.trim();
    if (display === this.data.originalDisplay.trim()) {
      wx.navigateBack();
      return;
    }

    // Confirm BEFORE sending if we predict a merge.
    if (this.data.collisionDisplay) {
      const ok = await new Promise<boolean>((resolve) => {
        wx.showModal({
          title: '合并到已存在标签',
          content: `保存后 #${this.data.originalDisplay} 将与 #${this.data.collisionDisplay} 合并。该操作无法撤销。`,
          confirmText: '合并',
          success: (r) => resolve(r.confirm === true),
          fail: () => resolve(false),
        });
      });
      if (!ok) return;
    }

    this.setData({ submitting: true });
    try {
      const res = await tagsService.rename(this.data.tagName, display);
      wx.showToast({
        title: res.merged ? '合并完成' : '已更新',
        icon: 'success',
      });
      setTimeout(() => {
        wx.navigateBack();
      }, 600);
    } catch {
      wx.showToast({ title: '保存失败', icon: 'none' });
      this.setData({ submitting: false });
    }
  },
});
