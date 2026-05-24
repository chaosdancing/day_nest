import type { CollectionSummaryDTO } from '@daynest/shared';
import { collectionsService } from '../../lib/services/collections.js';
import { favoritesService } from '../../lib/services/favorites.js';
import { tagsService, type TaggedPhotoItem } from '../../lib/services/tags.js';

type Scope = 'all' | 'collection' | 'photo';

const SCOPES: Array<{ key: Scope; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'collection', label: '集合标签' },
  { key: 'photo', label: '照片标签' },
];

/** Row view extends the DTO with a pre-formatted YYYY.MM.DD date string. */
type RowView = CollectionSummaryDTO & { displayDate: string };
type PhotoView = TaggedPhotoItem & {
  id: string;
  displayDate: string;
  frameStyle: string;
};

function formatDot(iso: string): string {
  const d = new Date(iso);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}.${m}.${day}`;
}

function toRowViews(items: CollectionSummaryDTO[]): RowView[] {
  return items.map((c) => ({ ...c, displayDate: formatDot(c.occurredOn) }));
}

function photoFrameStyle(item: TaggedPhotoItem): string {
  const { width, height } = item.photo;
  if (!width || !height) return '';
  const raw = (height / width) * 100;
  const clamped = Math.max(50, Math.min(160, raw));
  return `padding-top: ${Number(clamped.toFixed(2))}%`;
}

function toPhotoViews(items: TaggedPhotoItem[]): PhotoView[] {
  return items.map((item) => ({
    ...item,
    id: item.photo.id,
    displayDate: formatDot(item.collection.occurredOn),
    frameStyle: photoFrameStyle(item),
  }));
}

function estimatePhotoHeight(item: PhotoView): number {
  const raw = item.photo.width && item.photo.height
    ? (item.photo.height / item.photo.width) * 100
    : 75;
  return Math.max(50, Math.min(160, raw)) + 48;
}

function splitPhotoColumns(items: PhotoView[]): { left: PhotoView[]; right: PhotoView[] } {
  const left: PhotoView[] = [];
  const right: PhotoView[] = [];
  let leftHeight = 0;
  let rightHeight = 0;
  for (const item of items) {
    const h = estimatePhotoHeight(item);
    if (leftHeight <= rightHeight) {
      left.push(item);
      leftHeight += h;
    } else {
      right.push(item);
      rightHeight += h;
    }
  }
  return { left, right };
}

Page({
  data: {
    tagName: '' as string,
    tagDisplay: '' as string,
    scopes: SCOPES,
    scope: 'all' as Scope,
    items: [] as RowView[],
    photoItems: [] as PhotoView[],
    leftPhotos: [] as PhotoView[],
    rightPhotos: [] as PhotoView[],
    nextCursor: null as string | null,
    loading: false,
    loadingMore: false,
  },

  onLoad(query: Record<string, string | undefined>) {
    const tag = decodeURIComponent(query.tag ?? '');
    const display = decodeURIComponent(query.display ?? tag);
    const scope = ((query.scope as Scope) || 'all');
    this.setData({ tagName: tag, tagDisplay: display, scope });
    if (!tag) {
      wx.showToast({ title: '缺少标签名', icon: 'none' });
      return;
    }
    void this.refresh();
  },

  onShow() {
    // Re-pull on return-to-page so a rename committed on /pkgTags/rename/
    // (which only navigateBack's by 1 for the non-merge case) reflects the
    // new collection counts and tag display label here.
    if (this.data.tagName && !this.data.loading) {
      void this.refresh();
    }
  },

  onPullDownRefresh() {
    void this.refresh().finally(() => wx.stopPullDownRefresh());
  },

  async refresh() {
    if (!this.data.tagName || this.data.loading) return;
    this.setData({
      loading: true,
      items: [],
      photoItems: [],
      leftPhotos: [],
      rightPhotos: [],
      nextCursor: null,
    });
    try {
      const tagsPromise = tagsService.list().catch(() => null);
      const patch: Partial<{
        items: RowView[];
        photoItems: PhotoView[];
        leftPhotos: PhotoView[];
        rightPhotos: PhotoView[];
        nextCursor: string | null;
        tagDisplay: string;
      }> = {};
      if (this.data.scope === 'photo') {
        const [photos, tags] = await Promise.all([
          tagsService.photos(this.data.tagName, { limit: 30 }),
          tagsPromise,
        ]);
        const photoItems = toPhotoViews(photos.items);
        const cols = splitPhotoColumns(photoItems);
        patch.photoItems = photoItems;
        patch.leftPhotos = cols.left;
        patch.rightPhotos = cols.right;
        patch.nextCursor = photos.nextCursor;
        if (tags) {
          const live = tags.find((t) => t.name === this.data.tagName);
          if (live) patch.tagDisplay = live.displayName;
        }
        this.setData(patch);
        return;
      }
      const [collections, tags] = await Promise.all([
        collectionsService.list({
          limit: 20,
          tag: this.data.tagName,
          tagScope: this.data.scope,
        }),
        tagsPromise,
      ]);
      patch.items = toRowViews(collections.items);
      patch.nextCursor = collections.nextCursor;
      if (tags) {
        const live = tags.find((t) => t.name === this.data.tagName);
        if (live) patch.tagDisplay = live.displayName;
      }
      this.setData(patch);
    } catch {
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  async onLoadMore() {
    if (!this.data.nextCursor || this.data.loadingMore) return;
    this.setData({ loadingMore: true });
    try {
      if (this.data.scope === 'photo') {
        const res = await tagsService.photos(this.data.tagName, {
          limit: 30,
          cursor: this.data.nextCursor,
        });
        this.applyPhotoItems([...this.data.photoItems, ...toPhotoViews(res.items)], res.nextCursor);
        return;
      }
      const res = await collectionsService.list({
        limit: 20,
        cursor: this.data.nextCursor,
        tag: this.data.tagName,
        tagScope: this.data.scope,
      });
      this.setData({
        items: [...this.data.items, ...toRowViews(res.items)],
        nextCursor: res.nextCursor,
      });
    } catch {
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loadingMore: false });
    }
  },

  onScopeTap(e: WechatMiniprogram.TouchEvent) {
    const key = e.currentTarget.dataset.key as Scope;
    if (key === this.data.scope) return;
    this.setData({ scope: key });
    void this.refresh();
  },

  onCardTap(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    wx.navigateTo({ url: `/pkgCollection/detail/index?id=${encodeURIComponent(id)}` });
  },

  onPhotoTap(e: WechatMiniprogram.CustomEvent<{ photoId: string }>) {
    const item = this.data.photoItems.find((p) => p.photo.id === e.detail.photoId);
    if (!item) return;
    wx.navigateTo({
      url: `/pkgCollection/viewer/index?collectionId=${encodeURIComponent(item.collection.id)}&photoId=${encodeURIComponent(item.photo.id)}`,
    });
  },

  async onFavoriteToggle(e: WechatMiniprogram.CustomEvent<{ photoId: string }>) {
    const photoId = e.detail.photoId;
    const idx = this.data.photoItems.findIndex((p) => p.photo.id === photoId);
    if (idx < 0) return;
    const prev = this.data.photoItems;
    const item = prev[idx]!;
    const wasFav = item.photo.favoritedByMe;
    const next = [...prev];
    next[idx] = {
      ...item,
      photo: {
        ...item.photo,
        favoritedByMe: !wasFav,
        favoriteCount: item.photo.favoriteCount + (wasFav ? -1 : 1),
      },
    };
    this.applyPhotoItems(next, this.data.nextCursor);
    try {
      if (wasFav) await favoritesService.remove(photoId);
      else await favoritesService.add(photoId);
    } catch (err) {
      this.applyPhotoItems(prev, this.data.nextCursor);
      const fallback = wasFav ? '取消最爱失败' : '加入最爱失败';
      const msg = err instanceof Error ? err.message : fallback;
      wx.showToast({ title: msg.slice(0, 30), icon: 'none' });
    }
  },

  applyPhotoItems(photoItems: PhotoView[], nextCursor: string | null) {
    const cols = splitPhotoColumns(photoItems);
    this.setData({
      photoItems,
      leftPhotos: cols.left,
      rightPhotos: cols.right,
      nextCursor,
    });
  },

  onEditTap() {
    wx.navigateTo({
      url: `/pkgTags/rename/index?tag=${encodeURIComponent(this.data.tagName)}&display=${encodeURIComponent(this.data.tagDisplay)}`,
    });
  },
});
