/**
 * Client half of the thinking-level Chinese-label bundle.
 *
 * The conversation composer renders each model's reasoning effort with the
 * adapter-owned name (`Off`, `Minimal`, `Low`, `Medium`, `High`, `Xhigh`,
 * `Max`, all produced from the level id by capitalizing it, plus `Default`
 * for "provider default"). This module maps those rendered names to Chinese
 * everywhere the composer shows them, and registers a Settings page where
 * every level id can be mapped to an editable label.
 *
 * Label application is deliberately presentation-only: it rewrites the text
 * (and the trigger's title / accessible name) of the composer's model seat
 * after render, and re-applies after every React re-render. Selection values,
 * requests and stored state keep the original level ids, so nothing about
 * model routing changes.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-thinking-level-zh',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NS = 'thinkingLevelZh';
    const STORAGE_KEY = 'dsh.thinkingLevelZh.v1';

    /** The seven levels the pi-ai adapter can advertise, plus provider default. */
    const DEFAULT_LABELS = Object.freeze({
      off: '关闭',
      minimal: '最少',
      low: '低',
      medium: '中',
      high: '高',
      xhigh: '更高',
      max: '最高',
      providerDefault: '默认',
    });
    const KNOWN_ORDER = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'providerDefault'];
    const MAX_LABELS = 64;
    const MAX_LABEL_LENGTH = 32;

    const zhDict = {
      nav: '思考等级',
      title: '思考等级中文名称',
      desc: '将对话框中显示的模型思考等级改为中文。修改立即生效。',
      enabled: '启用中文等级名称',
      colLevel: '等级',
      colEnglish: '英文原名',
      colLabel: '中文名称',
      placeholder: '留空则保留英文',
      customTitle: '其他等级',
      customDesc: '任何模型可能提供的额外等级：填写等级 ID（如 ultra）与中文名称。',
      customId: '等级 ID',
      customName: '中文名称',
      add: '添加',
      reset: '恢复系统默认',
      hint: '映射只改变显示，不影响实际发送给模型的选择。',
      emptyId: '请先填写等级 ID',
      storageHost: '映射保存在本机系统设置中，重启后仍然有效。',
      storageLocal: '系统设置不可用，映射暂存在本机浏览器中。',
      saveFailed: '保存到系统设置失败，修改暂存在本机浏览器中。',
    };
    const enDict = {
      nav: 'Thinking levels',
      title: 'Thinking level Chinese labels',
      desc: 'Show model reasoning effort levels in Chinese in the conversation dialog. Changes apply immediately.',
      enabled: 'Enable Chinese level names',
      colLevel: 'Level',
      colEnglish: 'English name',
      colLabel: 'Chinese label',
      placeholder: 'Leave empty to keep English',
      customTitle: 'Other levels',
      customDesc: 'Extra levels a model may advertise: enter a level id (for example ultra) and its Chinese label.',
      customId: 'Level id',
      customName: 'Chinese label',
      add: 'Add',
      reset: 'Restore system defaults',
      hint: 'The mapping only changes display; the value sent to the model is unchanged.',
      emptyId: 'Enter a level id first',
      storageHost: 'The mapping is stored in this profile’s settings and survives restarts.',
      storageLocal: 'Profile settings are unavailable, so the mapping is kept in this browser only.',
      saveFailed: 'Saving to profile settings failed; the change is kept in this browser only.',
    };

    // #region Store
    function normalizeLabels(input) {
      const labels = {};
      if (input === null || typeof input !== 'object') return labels;
      let count = 0;
      for (const [rawId, rawLabel] of Object.entries(input)) {
        if (count >= MAX_LABELS) break;
        if (typeof rawId !== 'string' || typeof rawLabel !== 'string') continue;
        const id = rawId.trim();
        if (id === '' || id.length > 48) continue;
        const label = rawLabel.trim().slice(0, MAX_LABEL_LENGTH);
        if (label === '') continue;
        labels[id] = label;
        count += 1;
      }
      return labels;
    }

    function loadState() {
      try {
        const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
        if (typeof raw === 'string' && raw !== '') {
          const parsed = JSON.parse(raw);
          if (parsed !== null && typeof parsed === 'object') {
            return {
              enabled: parsed.enabled !== false,
              labels: normalizeLabels(parsed.labels),
              saveError: '',
            };
          }
        }
      } catch {
        /* Storage may be unavailable or hold a foreign value; fall back to defaults. */
      }
      return { enabled: true, labels: { ...DEFAULT_LABELS }, saveError: '' };
    }

    let state = loadState();
    const listeners = new Set();

    /** The Host profile entry whose Config holds the durable mapping. */
    const ENTRY_ID = 'thinking-level-zh';
    /** Shared configuration form over that entry, once ui-settings and the Host serve it. */
    let hostForm = null;
    const hostTimers = { enabled: null, labels: null };
    const hostValues = { enabled: undefined, labels: undefined };
    let pendingWrites = 0;

    function getSnapshot() {
      return state;
    }

    function subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }

    function persist() {
      try {
        globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify({ version: 1, enabled: state.enabled, labels: state.labels }));
      } catch {
        /* A browser without storage keeps the mapping for this page lifetime. */
      }
    }

    function notify() {
      for (const listener of [...listeners]) {
        try {
          listener();
        } catch {
          /* A broken subscriber must not stop the others or the label refresh. */
        }
      }
      scheduleScan();
    }

    function commit(next) {
      state = next;
      persist();
      notify();
    }

    function setSaveError(message) {
      if ((state.saveError ?? '') === message) return;
      state = { ...state, saveError: message };
      notify();
    }

    /**
     * Adopt the Host's resolved config without writing it back. Pending local
     * writes win: adopting mid-edit would revert the field being typed in.
     */
    function adoptHost() {
      if (hostForm === null || pendingWrites > 0) return;
      const section = hostForm.getSnapshot().value;
      if (section === null || typeof section !== 'object') return;
      if (section.labels === undefined || section.labels === null) return;
      const labels = normalizeLabels(section.labels);
      const enabled = section.enabled !== false;
      const unchanged = enabled === state.enabled && JSON.stringify(labels) === JSON.stringify(state.labels);
      if (unchanged) {
        if ((state.saveError ?? '') !== '') setSaveError('');
        return;
      }
      state = { ...state, enabled, labels, saveError: '' };
      persist();
      notify();
    }

    function dispatchHostWrite(field) {
      if (hostForm === null) return;
      const form = hostForm;
      const value = hostValues[field];
      if (value === undefined) return;
      pendingWrites += 1;
      let result;
      try {
        result = form.set(field, value);
      } catch (error) {
        pendingWrites -= 1;
        setSaveError(String(error?.message ?? error));
        return;
      }
      Promise.resolve(result).then(
        (answer) => {
          pendingWrites -= 1;
          setSaveError(answer !== null && typeof answer === 'object' && answer.ok === false ? 'rejected' : '');
        },
        (error) => {
          pendingWrites -= 1;
          setSaveError(String(error?.message ?? error));
        },
      );
    }

    function writeHost(field, value) {
      if (hostForm === null) return;
      hostValues[field] = value;
      if (hostTimers[field] !== null) clearTimeout(hostTimers[field]);
      hostTimers[field] = globalThis.setTimeout(() => {
        hostTimers[field] = null;
        dispatchHostWrite(field);
      }, 300);
    }

    function attachHost(form) {
      hostForm = form;
      const unsubscribe = form.subscribe(adoptHost);
      adoptHost();
      notify();
      return () => {
        unsubscribe();
        hostForm = null;
        notify();
      };
    }

    function setEnabled(enabled) {
      if (state.enabled === enabled) return;
      commit({ ...state, enabled });
      writeHost('enabled', enabled);
    }

    function setLabel(id, value) {
      const labels = { ...state.labels };
      const label = String(value ?? '').slice(0, MAX_LABEL_LENGTH);
      if (label.trim() === '') delete labels[id];
      else labels[id] = label;
      commit({ ...state, labels });
      writeHost('labels', labels);
    }

    function resetLabels() {
      const labels = { ...DEFAULT_LABELS };
      commit({ ...state, labels });
      writeHost('labels', labels);
    }
    // #endregion

    // #region Level names
    function capitalize(value) {
      if (typeof value !== 'string' || value === '') return '';
      return value.charAt(0).toUpperCase() + value.slice(1);
    }

    /** The adapter's displayed English name for a level id. */
    function englishName(id) {
      return id === 'providerDefault' ? 'Default' : capitalize(id);
    }

    function escapeRegExp(value) {
      return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /** English name -> Chinese label, longest name first so prefixes cannot win. */
    function translations() {
      const map = new Map();
      if (!state.enabled) return map;
      for (const [id, label] of Object.entries(state.labels)) {
        const english = englishName(id);
        if (english === '' || english === label) continue;
        map.set(english, label);
      }
      return new Map([...map.entries()].sort((a, b) => b[0].length - a[0].length));
    }
    // #endregion

    // #region Label rewriter
    const TEXT_SELECTORS = [
      '[class*="_triggerEffort"]',
      '[class*="_cellValue"]',
      'button[role="menuitemradio"] [class*="_modelName"]',
    ];
    const TRIGGER_SELECTOR = 'button[class*="_trigger"][aria-haspopup="menu"]';

    function replaceInAttribute(value, map) {
      let next = value;
      for (const [english, label] of map) {
        const pattern = new RegExp(`(^|[^A-Za-z0-9_])${escapeRegExp(english)}(?![A-Za-z0-9_])`, 'g');
        next = next.replace(pattern, (match, prefix) => `${prefix}${label}`);
      }
      return next;
    }

    function scan() {
      const map = translations();
      if (map.size === 0 || typeof document === 'undefined') return;

      for (const selector of TEXT_SELECTORS) {
        for (const element of document.querySelectorAll(selector)) {
          const current = element.textContent;
          if (current === null) continue;
          const label = map.get(current);
          if (label !== undefined) element.textContent = label;
        }
      }

      for (const trigger of document.querySelectorAll(TRIGGER_SELECTOR)) {
        for (const attribute of ['title', 'aria-label']) {
          const value = trigger.getAttribute(attribute);
          if (value === null || value === '') continue;
          const next = replaceInAttribute(value, map);
          if (next !== value) trigger.setAttribute(attribute, next);
        }
      }
    }

    /** Subtree that owns the effort text: the composer seat and its portaled menu. */
    const COMPOSER_SCOPE = '[class*="_root"],[class*="_menu"]';

    function touchesComposer(record) {
      if (record.type === 'childList') {
        for (const node of record.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (typeof node.matches === 'function' && (node.matches(COMPOSER_SCOPE) || node.querySelector(COMPOSER_SCOPE) !== null)) return true;
        }
      }
      const target = record.target;
      const element = target.nodeType === 1 ? target : target.parentElement;
      return element !== null && element !== undefined && typeof element.closest === 'function' && element.closest(COMPOSER_SCOPE) !== null;
    }

    let scheduled = false;
    let disposed = false;
    function scheduleScan() {
      if (scheduled || disposed) return;
      scheduled = true;
      globalThis.setTimeout(() => {
        scheduled = false;
        if (!disposed) scan();
      }, 80);
    }

    function installLabelRewriter() {
      if (typeof document === 'undefined' || document.body === null) return () => {};
      disposed = false;
      const observer = new MutationObserver((records) => {
        for (const record of records) {
          if (touchesComposer(record)) {
            scheduleScan();
            return;
          }
        }
      });
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
      const unsubscribe = subscribe(scheduleScan);
      scheduleScan();
      return () => {
        disposed = true;
        observer.disconnect();
        unsubscribe();
      };
    }
    // #endregion

    // #region Settings page
    const CSS = `
.tlz-root{display:flex;flex-direction:column;gap:16px;width:100%;font-size:14px;line-height:20px;color:var(--dsw-alias-label-primary)}
.tlz-desc{margin:0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
.tlz-switch{display:flex;align-items:center;gap:8px;font-size:14px}
.tlz-switch input{width:16px;height:16px;margin:0;accent-color:var(--dsw-alias-state-business-primary)}
.tlz-table{width:100%;border-collapse:collapse}
.tlz-table th{padding:8px 0;font-weight:400;font-size:12px;line-height:18px;text-align:left;color:var(--dsw-alias-label-tertiary);border-bottom:.5px solid var(--dsw-alias-border-l2)}
.tlz-table td{padding:8px 0;vertical-align:middle;border-bottom:.5px solid var(--dsw-alias-border-l2)}
.tlz-table td+td, .tlz-table th+th{padding-left:18px}
.tlz-id{color:var(--dsw-alias-label-secondary);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px}
.tlz-en{color:var(--dsw-alias-label-tertiary);font-size:12px}
.tlz-input{box-sizing:border-box;width:100%;padding:5px 8px;font:inherit;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover);border:.5px solid transparent;border-radius:var(--dsw-radius-md);outline:none}
.tlz-input::placeholder{color:var(--dsw-alias-label-tertiary)}
.tlz-input:focus{border-color:var(--dsw-alias-state-business-primary);background:transparent}
.tlz-custom{display:flex;flex-direction:column;gap:8px}
.tlz-custom-row{display:flex;gap:8px;align-items:center}
.tlz-custom-row .tlz-id-input{flex:0 0 160px}
.tlz-custom-row .tlz-name-input{flex:1 1 auto}
.tlz-btn{flex:none;padding:5px 10px;font:inherit;font-size:13px;line-height:18px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover);border:none;border-radius:var(--dsw-radius-md);cursor:pointer}
.tlz-btn:hover{color:var(--dsw-alias-state-business-primary)}
.tlz-btn:disabled{opacity:.5;cursor:default}
.tlz-footer{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.tlz-hint{margin:0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
.tlz-subtitle{margin:0;font-size:13px;line-height:20px}
`;

    function installStyles() {
      const tag = document.createElement('style');
      tag.dataset.plugin = '@local/dsh-thinking-level-zh';
      tag.textContent = CSS;
      document.head.appendChild(tag);
      return () => {
        tag.remove();
      };
    }

    function SettingsPage(props) {
      const t = typeof props.t === 'function' ? props.t : (key) => key;
      const snapshot = React.useSyncExternalStore(subscribe, getSnapshot);
      const [customId, setCustomId] = React.useState('');
      const [customName, setCustomName] = React.useState('');
      const [hint, setHint] = React.useState('');

      const rows = [...KNOWN_ORDER];
      for (const id of Object.keys(snapshot.labels)) {
        if (!rows.includes(id)) rows.push(id);
      }

      const addCustom = () => {
        const id = customId.trim();
        if (id === '') {
          setHint(t('emptyId'));
          return;
        }
        const name = customName.trim() || id;
        setLabel(id, name);
        setCustomId('');
        setCustomName('');
        setHint('');
      };

      return h(
        'div',
        { className: 'tlz-root' },
        h('p', { className: 'tlz-desc' }, t('desc')),
        h(
          'label',
          { className: 'tlz-switch' },
          h('input', {
            type: 'checkbox',
            checked: snapshot.enabled,
            onChange: (event) => setEnabled(event.target.checked),
          }),
          h('span', null, t('enabled')),
        ),
        h(
          'table',
          { className: 'tlz-table' },
          h(
            'thead',
            null,
            h(
              'tr',
              null,
              h('th', { style: { width: '22%' } }, t('colLevel')),
              h('th', { style: { width: '30%' } }, t('colEnglish')),
              h('th', null, t('colLabel')),
            ),
          ),
          h(
            'tbody',
            null,
            rows.map((id) =>
              h(
                'tr',
                { key: id },
                h('td', null, h('code', { className: 'tlz-id' }, id)),
                h('td', null, h('span', { className: 'tlz-en' }, englishName(id))),
                h(
                  'td',
                  null,
                  h('input', {
                    className: 'tlz-input',
                    type: 'text',
                    value: snapshot.labels[id] ?? '',
                    placeholder: t('placeholder'),
                    maxLength: MAX_LABEL_LENGTH,
                    'aria-label': `${id} ${t('colLabel')}`,
                    onChange: (event) => setLabel(id, event.target.value),
                  }),
                ),
              ),
            ),
          ),
        ),
        h(
          'div',
          { className: 'tlz-custom' },
          h('p', { className: 'tlz-subtitle' }, t('customTitle')),
          h('p', { className: 'tlz-hint' }, t('customDesc')),
          h(
            'div',
            { className: 'tlz-custom-row' },
            h('input', {
              className: 'tlz-input tlz-id-input',
              type: 'text',
              value: customId,
              placeholder: t('customId'),
              maxLength: 48,
              onChange: (event) => {
                setCustomId(event.target.value);
                setHint('');
              },
            }),
            h('input', {
              className: 'tlz-input tlz-name-input',
              type: 'text',
              value: customName,
              placeholder: t('customName'),
              maxLength: MAX_LABEL_LENGTH,
              onChange: (event) => setCustomName(event.target.value),
            }),
            h('button', { className: 'tlz-btn', type: 'button', onClick: addCustom }, t('add')),
          ),
        ),
        h(
          'div',
          { className: 'tlz-footer' },
          h('button', { className: 'tlz-btn', type: 'button', onClick: resetLabels }, t('reset')),
          hint !== '' ? h('span', { className: 'tlz-hint', style: { color: 'var(--dsw-alias-state-warn-label)' } }, hint) : null,
        ),
        h(
          'p',
          { className: 'tlz-hint' },
          snapshot.saveError !== '' && snapshot.saveError !== undefined ? t('saveFailed') : hostForm === null ? t('storageLocal') : t('storageHost'),
        ),
        h('p', { className: 'tlz-hint' }, t('hint')),
      );
    }
    // #endregion

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => {
          const disposeZh = ctx.locale.register(NS, 'zh', zhDict);
          const disposeEn = ctx.locale.register(NS, 'en', enDict);
          return () => {
            disposeZh();
            disposeEn();
          };
        });

        ctx.effect(() => installStyles());
        ctx.effect(() => installLabelRewriter());

        // A Host-backed form makes the mapping durable; without it the page
        // still works against the browser-local cache in the same store.
        ctx.effect(() => {
          try {
            const configForms = typeof ctx.get === 'function' ? ctx.get('configForms') : undefined;
            if (configForms === undefined || configForms === null || typeof configForms.get !== 'function') {
              return () => {};
            }
            if (typeof configForms.whileServed === 'function') {
              return configForms.whileServed([ENTRY_ID], () => attachHost(configForms.get(ENTRY_ID)));
            }
            return attachHost(configForms.get(ENTRY_ID));
          } catch {
            // An older or absent settings transport leaves the browser-local
            // mapping in place instead of failing the whole plugin.
            return () => {};
          }
        });

        const t = ctx.locale.bind(NS);
        ctx.slots.inject('settings.section', () =>
          ctx.slots.register(
            {
              name: 'settings.section',
              id: 'thinking-level-zh',
              order: 55,
              label: () => t('nav'),
              locale: NS,
            },
            SettingsPage,
          ),
        );
      },
    };
  },
});
