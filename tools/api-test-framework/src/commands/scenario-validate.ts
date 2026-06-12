import { existsSync } from 'node:fs';
import { getRequirementScenariosDir, loadScenariosFromDir } from '../lib/yaml-loader.js';
import { validateScenario } from '../lib/http-scenario-validator.js';
import type { ValidationResult } from '../lib/types.js';

export interface ScenarioValidateOptions {
  projectRoot: string;
}

export function runScenarioValidate(requirement: string, opts: ScenarioValidateOptions): ValidationResult[] {
  const scenariosDir = getRequirementScenariosDir(opts.projectRoot, requirement);

  if (!existsSync(scenariosDir)) {
    console.error(`错误: 场景目录不存在: ${scenariosDir}`);
    process.exit(1);
  }

  const scenarios = loadScenariosFromDir(scenariosDir);
  if (scenarios.length === 0) {
    console.error(`错误: 目录 ${scenariosDir} 中没有 YAML 场景文件`);
    process.exit(1);
  }

  const results = scenarios.map(scenario => validateScenario(scenario, scenarios));
  const failed = results.filter(r => !r.valid);

  console.log(`\n=== HTTP 场景校验结果 ===`);
  console.log(`总计: ${results.length} 个场景`);
  console.log(`通过: ${results.length - failed.length}`);
  console.log(`失败: ${failed.length}`);

  for (const result of failed) {
    console.log(`\n❌ ${result.file}`);
    for (const error of result.errors) {
      console.log(`   [${error.layer}] ${error.path}: ${error.message}`);
    }
  }

  if (failed.length === 0) console.log(`\n✅ 全部通过`);

  return results;
}
