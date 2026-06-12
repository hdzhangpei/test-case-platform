import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import Handlebars from 'handlebars';
import {
  getRequirementReviewDir,
  getRequirementScenariosDir,
  loadScenariosFromDir,
} from '../lib/yaml-loader.js';
import { validateScenario } from '../lib/http-scenario-validator.js';

Handlebars.registerHelper('json', (value: unknown) => JSON.stringify(value, null, 2));
Handlebars.registerHelper('escapeAttr', (val: unknown) => {
  const s = val === undefined || val === null ? '' : String(typeof val === 'object' ? JSON.stringify(val) : val);
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
});

export interface ScenarioReviewOptions {
  projectRoot: string;
}

export function runScenarioReview(requirement: string, opts: ScenarioReviewOptions): string {
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

  const validations = scenarios.map(scenario => validateScenario(scenario, scenarios));

  const templateData = {
    requirement,
    generated: new Date().toISOString().split('T')[0],
    totalScenarios: scenarios.length,
    totalSteps: scenarios.reduce((total, scenario) => total + scenario.data.steps.length, 0),
    passedCount: validations.filter(result => result.valid).length,
    failedCount: validations.filter(result => !result.valid).length,
    scenarios: scenarios.map((scenario, scenarioIndex) => {
      const validation = validations[scenarioIndex];
      return {
        id: scenario.data.metadata.id,
        name: scenario.data.metadata.name,
        tags: (scenario.data.metadata.tags || []).join(', ') || '-',
        baseUrl: scenario.data.config?.baseUrl || '(运行时指定)',
        cookieEnv: scenario.data.config?.cookieEnv || '(未配置)',
        headerCount: Object.keys(scenario.data.config?.headers || {}).length,
        stepCount: scenario.data.steps.length,
        statusClass: validation.valid ? 'ok' : 'bad',
        statusLabel: validation.valid ? '校验通过' : '校验失败',
        errors: validation.errors,
        raw: scenario.raw,
        steps: scenario.data.steps.map((step, stepIndex) => ({
          displayIndex: String(stepIndex + 1).padStart(2, '0'),
          id: step.id,
          name: step.name,
          method: step.request.method,
          path: step.request.path,
          bodyJson: JSON.stringify(step.request.body ?? null, null, 2),
          headersJson: JSON.stringify(step.request.headers || {}, null, 2),
          assertions: (step.expected?.assertions || []).map(assertion => ({
            type: assertion.type,
            target: assertion.target,
            valueText: assertion.value === undefined ? '-' : JSON.stringify(assertion.value),
          })),
          captures: Object.entries(step.capture || {}).map(([name, path]) => ({ name, path })),
        })),
      };
    }),
  };

  const templatePath = new URL('../../templates/http-scenario-review.hbs', import.meta.url);
  const template = Handlebars.compile(readFileSync(templatePath, 'utf-8'));
  const html = template(templateData);

  const reviewDir = getRequirementReviewDir(opts.projectRoot, requirement);
  mkdirSync(reviewDir, { recursive: true });
  const outputPath = join(reviewDir, `http-scenario-review-${templateData.generated}.html`);
  writeFileSync(outputPath, html, 'utf-8');

  console.log(`✅ HTTP 场景审查页面已生成: ${outputPath}`);
  return outputPath;
}
