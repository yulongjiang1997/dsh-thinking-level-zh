/**
 * Offline checks for the Host Config schema: Cordis validates through the
 * Standard Schema interface, and the Settings document projects the schema
 * through `toJSON()` plus schemastery's own reader. Both are exercised here
 * without starting the Harness.
 *
 * Volatile fields deliberately validate to a live reference object (read with
 * `.get()`), which is how Settings edits them in place instead of restarting
 * the entry.
 */
import { Config, DEFAULT_LABELS } from '../index.js';
import z from '@deepseek-ai/schemastery';

let failures = 0;
function check(name, condition, detail) {
  if (condition) {
    console.log(`ok   ${name}`);
  } else {
    failures += 1;
    console.log(`FAIL ${name}${detail === undefined ? '' : ' — ' + detail}`);
  }
}

// 1. Cordis validates a plugin's Config through the Standard Schema face.
check('Config exposes ~standard.validate', typeof Config?.['~standard']?.validate === 'function');
const accepted = Config['~standard'].validate({ enabled: false, labels: { high: '极高', custom: '自定义' } });
check('valid config accepted', accepted.issues === undefined, JSON.stringify(accepted.issues));
const acceptedValue = accepted.value ?? {};
check(
  'accepted values preserved',
  typeof acceptedValue.labels?.get === 'function' && acceptedValue.labels.get().high === '极高' && acceptedValue.enabled.get() === false,
  JSON.stringify(acceptedValue),
);
const defaults = Config['~standard'].validate({});
check(
  'defaults fill an empty config',
  defaults.value?.enabled?.get() === true && defaults.value?.labels?.get()?.medium === '中',
  JSON.stringify(defaults.value),
);
const rejected = Config['~standard'].validate({ labels: { high: 42 } });
check('non-string label rejected', Array.isArray(rejected.issues) && rejected.issues.length > 0);

// 2. The Settings document projects forms from toJSON() and reconstructs them.
const rebuilt = new z(Config.toJSON());
check('toJSON round-trips through schemastery', rebuilt.type === 'object' && typeof rebuilt.dict === 'object');
check(
  'round-trip keeps defaults',
  rebuilt['~standard'].validate({}).value?.labels?.get()?.low === '低',
);

// 3. Both fields are volatile, the shape dsh-settings edits in place.
function volatileForm(schema) {
  if (schema.meta.volatile) return schema;
  if (schema.type === 'object') {
    const dict = Object.fromEntries(
      Object.entries(schema.dict ?? {}).flatMap(([key, child]) => {
        const field = volatileForm(child);
        return field === undefined ? [] : [[key, field]];
      }),
    );
    return Object.keys(dict).length === 0 ? undefined : z.object(dict);
  }
  return undefined;
}
const form = volatileForm(rebuilt);
check(
  'both fields are editable live',
  form !== undefined && Object.keys(form.dict ?? {}).sort().join(',') === 'enabled,labels',
  form === undefined ? 'no volatile form' : Object.keys(form.dict ?? {}).join(','),
);

check('default labels list the seven levels plus provider default', Object.keys(DEFAULT_LABELS).length === 8);
process.exit(failures === 0 ? 0 : 1);
