import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadCasesFromDir, getRequirementCasesDir } from '../lib/yaml-loader.js';
import { validateCase } from '../lib/schema-validator.js';
import type { ValidationResult } from '../lib/types.js';

export interface ValidateOptions {
  projectRoot: string;
}

export function runValidate(requirement: string, opts: ValidateOptions): ValidationResult[] {
  const casesDir = getRequirementCasesDir(opts.projectRoot, requirement);

  if (!existsSync(casesDir)) {
    console.error(`错误: 用例目录不存在: ${casesDir}`);
    console.error(`请先创建目录并放入 YAML 用例文件`);
    process.exit(1);
  }

  const cases = loadCasesFromDir(casesDir);
  if (cases.length === 0) {
    console.error(`错误: 目录 ${casesDir} 中没有 YAML 文件`);
    process.exit(1);
  }

  const results: ValidationResult[] = [];
  for (const loaded of cases) {
    const result = validateCase(loaded, cases, opts.projectRoot);
    results.push(result);
  }

  // Print summary
  const passed = results.filter(r => r.valid);
  const failed = results.filter(r => !r.valid);
  const withWarnings = results.filter(r => r.warnings.length > 0);

  console.log(`\n=== 校验结果 ===`);
  console.log(`总计: ${results.length} 个用例`);
  console.log(`通过: ${passed.length}`);
  console.log(`失败: ${failed.length}`);
  console.log(`警告: ${withWarnings.length}`);

  for (const r of failed) {
    console.log(`\n❌ ${r.file}`);
    for (const e of r.errors) {
      console.log(`   [${e.layer}] ${e.path}: ${e.message}`);
    }
  }

  for (const r of withWarnings) {
    if (r.valid) {
      console.log(`\n⚠️  ${r.file}`);
    }
    for (const w of r.warnings) {
      console.log(`   [${w.layer}] ${w.path}: ${w.message}`);
    }
  }

  if (failed.length === 0) {
    console.log(`\n✅ 全部通过`);
  }

  return results;
}
