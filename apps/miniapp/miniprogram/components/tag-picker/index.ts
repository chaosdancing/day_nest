Component({
  properties: {
    value: { type: Array, value: [] as string[] },
    suggest: { type: Array, value: [] as string[] },
    placeholder: { type: String, value: '加个标签…' },
  },
  data: {
    draft: '',
    visibleSuggestions: [] as string[],
  },
  observers: {
    'value, suggest, draft'(value: string[], suggest: string[], draft: string) {
      const have = new Set(value);
      const filt = (suggest ?? [])
        .filter((s) => !have.has(s))
        .filter((s) => (draft.trim() ? s.toLocaleLowerCase().includes(draft.trim().toLocaleLowerCase()) : true))
        .slice(0, 8);
      this.setData({ visibleSuggestions: filt });
    },
  },
  methods: {
    onInput(e: WechatMiniprogram.Input) {
      this.setData({ draft: e.detail.value });
    },
    onConfirm() {
      const t = this.data.draft.trim();
      if (!t) return;
      this.addTag(t);
    },
    onPickSuggest(e: WechatMiniprogram.TouchEvent) {
      const t = (e.currentTarget.dataset.tag as string).trim();
      if (!t) return;
      this.addTag(t);
    },
    onRemove(e: WechatMiniprogram.TouchEvent) {
      const t = e.currentTarget.dataset.tag as string;
      const next = (this.properties.value as string[]).filter((x) => x !== t);
      this.triggerEvent('change', { value: next });
    },
    addTag(t: string) {
      const cur = this.properties.value as string[];
      if (cur.includes(t)) {
        this.setData({ draft: '' });
        return;
      }
      this.triggerEvent('change', { value: [...cur, t] });
      this.setData({ draft: '' });
    },
  },
});
