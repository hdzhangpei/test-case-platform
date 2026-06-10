import { writeFileSync } from 'node:fs';
import { Document, stringify } from 'yaml';
import type { TestCase } from './types.js';

const KEY_ORDER = [
  'version', 'metadata', 'target', 'setup', 'input', 'invocation', 'expected', 'cleanup', 'notes'
];

const METADATA_ORDER = ['id', 'name', 'requirement', 'priority', 'group', 'author', 'created', 'tags'];
const TARGET_ORDER = ['service', 'method', 'bean_class'];
const INPUT_ORDER = ['type', 'fields', 'wrapper'];
const FIELD_ORDER = ['field', 'value', 'type', 'items'];
const ASSERTION_ORDER = ['type', 'target', 'value'];

function sortObject(obj: Record<string, unknown>, order: string[]): Record<string, unknown> {
  const sorted: Record<string, unknown> = {};
  for (const key of order) {
    if (key in obj) sorted[key] = obj[key];
  }
  for (const key of Object.keys(obj)) {
    if (!(key in sorted)) sorted[key] = obj[key];
  }
  return sorted;
}

function orderCase(data: TestCase): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const raw = data as unknown as Record<string, unknown>;

  for (const key of KEY_ORDER) {
    if (!(key in raw)) continue;
    if (key === 'metadata') {
      result[key] = sortObject(raw[key] as Record<string, unknown>, METADATA_ORDER);
    } else if (key === 'target') {
      result[key] = sortObject(raw[key] as Record<string, unknown>, TARGET_ORDER);
    } else if (key === 'input') {
      const input = raw[key] as Record<string, unknown>;
      const ordered = sortObject(input, INPUT_ORDER);
      if (Array.isArray(ordered.fields)) {
        ordered.fields = (ordered.fields as Record<string, unknown>[]).map(f => sortObject(f, FIELD_ORDER));
      }
      result[key] = ordered;
    } else if (key === 'expected') {
      const exp = raw[key] as Record<string, unknown>;
      if (Array.isArray(exp.assertions)) {
        exp.assertions = (exp.assertions as Record<string, unknown>[]).map(a => sortObject(a, ASSERTION_ORDER));
      }
      result[key] = exp;
    } else {
      result[key] = raw[key];
    }
  }
  // Include any remaining keys not in order
  for (const key of Object.keys(raw)) {
    if (!(key in result)) result[key] = raw[key];
  }
  return result;
}

export function writeCaseToFile(filePath: string, data: TestCase): void {
  const ordered = orderCase(data);
  const yamlStr = stringify(ordered, {
    indent: 2,
    lineWidth: 120,
  });
  writeFileSync(filePath, Buffer.from(yamlStr, 'utf-8'));
}
