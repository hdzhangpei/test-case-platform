import { readFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { TestCase } from './types.js';

export interface LoadedCase {
  filePath: string;
  fileName: string;
  data: TestCase;
  raw: string;
}

export function loadCase(filePath: string): LoadedCase {
  const raw = readFileSync(filePath, 'utf-8');
  const data = parseYaml(raw) as TestCase;
  return {
    filePath,
    fileName: basename(filePath, '.yaml'),
    data,
    raw,
  };
}

export function loadCasesFromDir(casesDir: string): LoadedCase[] {
  const files = readdirSync(casesDir)
    .filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))
    .sort();

  return files.map(f => loadCase(join(casesDir, f)));
}

export function getRequirementCasesDir(projectRoot: string, requirement: string): string {
  return join(projectRoot, 'tests', 'integration', requirement, 'cases');
}

export function getRequirementReviewDir(projectRoot: string, requirement: string): string {
  return join(projectRoot, 'tests', 'integration', requirement, 'review');
}

export function getRequirementReportsDir(projectRoot: string, requirement: string): string {
  return join(projectRoot, 'tests', 'integration', requirement, 'reports');
}
