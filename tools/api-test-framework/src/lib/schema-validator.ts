import { readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { globSync } from 'glob';
import Ajv from 'ajv';
import type { LoadedCase } from './yaml-loader.js';
import type { ValidationResult, ValidationError, ValidationWarning } from './types.js';

const schemaPath = new URL('../../schema/test-case.schema.json', import.meta.url);
const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'));

const ajv = new Ajv({ allErrors: true, strict: false });
const validateSchema = ajv.compile(schema);

export function validateCase(
  loaded: LoadedCase,
  allCases: LoadedCase[],
  projectRoot: string
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

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

  // Layer 2: Cross-reference validation (verify classes exist in source)
  if (loaded.data.target?.bean_class) {
    const classExists = checkClassExists(projectRoot, loaded.data.target.bean_class);
    if (!classExists) {
      warnings.push({
        layer: 'cross_ref',
        path: 'target.bean_class',
        message: `类 ${loaded.data.target.bean_class} 在源码中未找到（可能未 bootstrap）`,
      });
    }
  }

  if (loaded.data.input?.type) {
    const dtoExists = checkClassExists(projectRoot, loaded.data.input.type);
    if (!dtoExists) {
      warnings.push({
        layer: 'cross_ref',
        path: 'input.type',
        message: `DTO 类 ${loaded.data.input.type} 在源码中未找到`,
      });
    }
  }

  if (loaded.data.target?.bean_class && loaded.data.target?.method) {
    const methodExists = checkMethodExists(
      projectRoot,
      loaded.data.target.bean_class,
      loaded.data.target.method
    );
    if (!methodExists) {
      warnings.push({
        layer: 'cross_ref',
        path: 'target.method',
        message: `方法 ${loaded.data.target.method} 在接口中未找到`,
      });
    }
  }

  // Layer 3: Consistency checks
  const expectedId = basename(loaded.filePath, '.yaml').replace(/\.yml$/, '');
  if (loaded.data.metadata?.id && loaded.data.metadata.id !== expectedId) {
    errors.push({
      layer: 'consistency',
      path: 'metadata.id',
      message: `ID "${loaded.data.metadata.id}" 与文件名 "${expectedId}" 不一致`,
    });
  }

  // Check ID uniqueness
  const duplicates = allCases.filter(
    c => c !== loaded && c.data.metadata?.id === loaded.data.metadata?.id
  );
  if (duplicates.length > 0) {
    errors.push({
      layer: 'consistency',
      path: 'metadata.id',
      message: `ID "${loaded.data.metadata?.id}" 重复，出现在: ${duplicates.map(d => d.fileName).join(', ')}`,
    });
  }

  // Validate assertion targets are syntactically reasonable
  if (loaded.data.expected?.assertions) {
    for (let i = 0; i < loaded.data.expected.assertions.length; i++) {
      const a = loaded.data.expected.assertions[i];
      if ((a.type === 'equals' || a.type === 'contains' || a.type === 'greater_than') && a.value === undefined) {
        errors.push({
          layer: 'consistency',
          path: `expected.assertions[${i}]`,
          message: `断言类型 "${a.type}" 需要 value 字段`,
        });
      }
    }
  }

  return {
    file: loaded.fileName,
    caseId: loaded.data.metadata?.id || 'unknown',
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function checkClassExists(projectRoot: string, className: string): boolean {
  const relativePath = className.replace(/\./g, '/') + '.java';
  const searchDirs = [
    join(projectRoot, 'backend'),
  ];

  for (const dir of searchDirs) {
    if (!existsSync(dir)) continue;
    const matches = globSync(`**/${relativePath}`, { cwd: dir });
    if (matches.length > 0) return true;
  }
  return false;
}

function checkMethodExists(projectRoot: string, className: string, methodName: string): boolean {
  const relativePath = className.replace(/\./g, '/') + '.java';
  const searchDirs = [
    join(projectRoot, 'backend'),
  ];

  for (const dir of searchDirs) {
    if (!existsSync(dir)) continue;
    const matches = globSync(`**/${relativePath}`, { cwd: dir });
    for (const match of matches) {
      const content = readFileSync(join(dir, match), 'utf-8');
      if (content.includes(methodName)) return true;
    }
  }
  return false;
}
