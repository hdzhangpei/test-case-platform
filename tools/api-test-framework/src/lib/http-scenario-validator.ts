import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import Ajv from 'ajv';
import type { LoadedScenario } from '../lib/yaml-loader.js';
import type { ValidationResult, ValidationError } from '../lib/types.js';

const schemaPath = new URL('../../schema/http-scenario.schema.json', import.meta.url);
const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'));

const ajv = new Ajv({ allErrors: true, strict: false });
const validateSchema = ajv.compile(schema);

export function validateScenario(loaded: LoadedScenario, allScenarios: LoadedScenario[]): ValidationResult {
  const errors: ValidationError[] = [];

  // Layer 1: JSON Schema validation
  const schemaValid = validateSchema(loaded.data);
  if (!schemaValid && validateSchema.errors) {
    for (const err of validateSchema.errors) {
      errors.push({
        layer: 'schema',
        path: err.instancePath || '/',
        message: `${err.message}${err.params ? ' (' + JSON.stringify(err.params) + ')' : ''}`,
      });
    }
  }

  // Layer 2: Consistency - ID vs filename
  const expectedId = basename(loaded.filePath, '.yaml').replace(/\.yml$/, '');
  if (loaded.data.metadata?.id && loaded.data.metadata.id !== expectedId) {
    errors.push({
      layer: 'consistency',
      path: 'metadata.id',
      message: `ID "${loaded.data.metadata.id}" 与文件名 "${expectedId}" 不一致`,
    });
  }

  // Layer 2: Consistency - ID uniqueness
  const duplicates = allScenarios.filter(
    s => s !== loaded && s.data.metadata?.id === loaded.data.metadata?.id
  );
  if (duplicates.length > 0) {
    errors.push({
      layer: 'consistency',
      path: 'metadata.id',
      message: `ID "${loaded.data.metadata?.id}" 重复，出现在: ${duplicates.map(d => d.fileName).join(', ')}`,
    });
  }

  // Layer 3: Step ID uniqueness + assertion completeness
  const stepIds = new Set<string>();
  for (let i = 0; i < (loaded.data.steps || []).length; i++) {
    const step = loaded.data.steps[i];
    if (stepIds.has(step.id)) {
      errors.push({
        layer: 'consistency',
        path: `steps[${i}].id`,
        message: `步骤 ID "${step.id}" 重复`,
      });
    }
    stepIds.add(step.id);

    for (let j = 0; j < (step.expected?.assertions || []).length; j++) {
      const assertion = step.expected!.assertions![j];
      if ((assertion.type === 'equals' || assertion.type === 'contains' || assertion.type === 'greater_than') && assertion.value === undefined) {
        errors.push({
          layer: 'consistency',
          path: `steps[${i}].expected.assertions[${j}]`,
          message: `断言类型 "${assertion.type}" 需要 value 字段`,
        });
      }
    }
  }

  return {
    file: loaded.fileName,
    caseId: loaded.data.metadata?.id || 'unknown',
    valid: errors.length === 0,
    errors,
    warnings: [],
  };
}
