import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getRequirementReportsDir, getRequirementScenariosDir, loadScenariosFromDir } from '../lib/yaml-loader.js';
import { validateScenario } from '../lib/http-scenario-validator.js';
import { runHttpScenario } from '../lib/http-scenario-runner.js';
import type { HttpScenarioRunReport } from '../lib/types.js';

export interface ScenarioRunOptions {
  projectRoot: string;
  scenario?: string;
  baseUrl?: string;
  cookieEnv?: string;
}

export async function runScenarioRun(requirement: string, opts: ScenarioRunOptions): Promise<string[]> {
  const scenariosDir = getRequirementScenariosDir(opts.projectRoot, requirement);

  if (!existsSync(scenariosDir)) {
    console.error(`错误: 场景目录不存在: ${scenariosDir}`);
    process.exit(1);
  }

  const scenarios = loadScenariosFromDir(scenariosDir)
    .filter(s => !opts.scenario || s.data.metadata.id === opts.scenario || s.fileName === opts.scenario);

  if (scenarios.length === 0) {
    console.error(`错误: 未找到可执行场景${opts.scenario ? `: ${opts.scenario}` : ''}`);
    process.exit(1);
  }

  const allScenarios = loadScenariosFromDir(scenariosDir);
  const validations = scenarios.map(s => validateScenario(s, allScenarios));
  const failed = validations.filter(v => !v.valid);

  if (failed.length > 0) {
    console.error(`错误: ${failed.length} 个场景校验失败，请先修复后再执行`);
    for (const result of failed) {
      console.error(`  ❌ ${result.file}: ${result.errors.map(e => e.message).join('; ')}`);
    }
    process.exit(1);
  }

  const reportsDir = getRequirementReportsDir(opts.projectRoot, requirement);
  mkdirSync(reportsDir, { recursive: true });

  const outputPaths: string[] = [];

  for (const scenario of scenarios) {
    console.log(`\n▶ 执行场景: ${scenario.data.metadata.name} (${scenario.data.metadata.id})`);

    const report: HttpScenarioRunReport = await runHttpScenario(requirement, scenario.data, {
      baseUrl: opts.baseUrl,
      cookieEnv: opts.cookieEnv,
    });

    const outputPath = join(reportsDir, `http-${report.scenarioId}-${report.generated}.json`);
    writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf-8');
    outputPaths.push(outputPath);

    console.log(`总步骤: ${report.summary.total}`);
    console.log(`通过: ${report.summary.passed}`);
    console.log(`失败: ${report.summary.failed}`);
    console.log(`耗时: ${report.summary.duration.toFixed(2)}s`);
    console.log(`报告: ${outputPath}`);
  }

  return outputPaths;
}
