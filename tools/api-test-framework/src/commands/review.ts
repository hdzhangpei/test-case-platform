import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import Handlebars from 'handlebars';
import { loadCasesFromDir, getRequirementCasesDir, getRequirementReviewDir } from '../lib/yaml-loader.js';
import { validateCase } from '../lib/schema-validator.js';
import type { ValidationResult } from '../lib/types.js';

Handlebars.registerHelper('lowercase', (str: string) => str?.toLowerCase() ?? '');
Handlebars.registerHelper('json', (val: unknown) => val === undefined ? '' : JSON.stringify(val));
Handlebars.registerHelper('escapeAttr', (val: unknown) => {
  const s = val === undefined || val === null ? '' : String(typeof val === 'object' ? JSON.stringify(val) : val);
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
});
Handlebars.registerHelper('eq', (a: unknown, b: unknown) => a === b);

export interface ReviewOptions {
  projectRoot: string;
}

export function runReview(requirement: string, opts: ReviewOptions): string {
  const casesDir = getRequirementCasesDir(opts.projectRoot, requirement);

  if (!existsSync(casesDir)) {
    console.error(`错误: 用例目录不存在: ${casesDir}`);
    process.exit(1);
  }

  const cases = loadCasesFromDir(casesDir);
  if (cases.length === 0) {
    console.error(`错误: 目录 ${casesDir} 中没有 YAML 文件`);
    process.exit(1);
  }

  // Validate all cases
  const validations: ValidationResult[] = cases.map(c => validateCase(c, cases, opts.projectRoot));

  // Prepare template data
  const templateData = {
    requirement,
    generated: new Date().toISOString().split('T')[0],
    totalCases: cases.length,
    passedCount: validations.filter(v => v.valid && v.warnings.length === 0).length,
    warningCount: validations.filter(v => v.valid && v.warnings.length > 0).length,
    failedCount: validations.filter(v => !v.valid).length,
    cases: cases.map((c, i) => ({
      id: c.data.metadata?.id || c.fileName,
      name: c.data.metadata?.name || '',
      priority: c.data.metadata?.priority || '',
      group: c.data.metadata?.group || '',
      author: c.data.metadata?.author || '',
      service: c.data.target?.service || '',
      method: c.data.target?.method || '',
      beanClass: c.data.target?.bean_class || '',
      inputType: c.data.input?.type || '',
      loginUser: c.data.setup?.login_user?.account || '',
      status: validations[i].valid
        ? (validations[i].warnings.length > 0 ? 'warning' : 'pass')
        : 'fail',
      errors: validations[i].errors,
      warnings: validations[i].warnings,
      fields: c.data.input?.fields || [],
      assertions: c.data.expected?.assertions || [],
      notes: c.data.notes || '',
      raw: c.raw,
      dataJson: JSON.stringify(c.data),
    })),
  };

  // Load and render template
  const templatePath = new URL('../../templates/review.hbs', import.meta.url);
  const templateSource = readFileSync(templatePath, 'utf-8');
  const template = Handlebars.compile(templateSource);
  const html = template(templateData);

  // Write output
  const reviewDir = getRequirementReviewDir(opts.projectRoot, requirement);
  mkdirSync(reviewDir, { recursive: true });
  const outputPath = join(reviewDir, `review-${templateData.generated}.html`);
  writeFileSync(outputPath, html, 'utf-8');

  console.log(`✅ 审查页面已生成: ${outputPath}`);
  return outputPath;
}
