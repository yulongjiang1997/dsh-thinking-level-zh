/**
 * Host half of the thinking-level Chinese-label bundle.
 *
 * The only Host-side job is persistence: the Config below is what the Settings
 * page edits through the profile's settings document, so a mapping survives
 * restarts and is shared by every browser signed into this profile. Both
 * fields are volatile, so an edit applies in place instead of restarting the
 * entry on every keystroke.
 */
import Schema from '@deepseek-ai/schemastery';

/** The seven levels the pi-ai adapter can advertise, plus provider default. */
export const DEFAULT_LABELS = Object.freeze({
  off: '关闭',
  minimal: '最少',
  low: '低',
  medium: '中',
  high: '高',
  xhigh: '更高',
  max: '最高',
  providerDefault: '默认',
});

export const Config = Schema.object({
  /** Whether the conversation composer shows the mapped Chinese names. */
  enabled: Schema.boolean().default(true).volatile(),
  /** Level id -> displayed Chinese label; an absent id keeps its English name. */
  labels: Schema.dict(Schema.string()).default({ ...DEFAULT_LABELS }).volatile(),
});

export function apply() {}
