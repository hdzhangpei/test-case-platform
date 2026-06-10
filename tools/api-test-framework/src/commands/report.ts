import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import Handlebars from 'handlebars';
import { loadCasesFromDir, getRequirementCasesDir, getRequirementReportsDir } from '../lib/yaml-loader.js';
import { parseSurefireReports, buildReport } from '../lib/report-parser.js';

Handlebars.registerHelper('formatDuration', (seconds: number) => {
  if (seconds < 1) return `${(seconds * 1000).toFixed(0)}ms`;
  return `${seconds.toFixed(2)}s`;
});
Handlebars.registerHelper('percent', (part: number, total: number) => {
  if (!total) return '0';
  return ((part / total) * 100).toFixed(1);
});
Handlebars.registerHelper('statusLabel', (status: string) => {
  const labels: Record<string, string> = { passed: '通过', failed: '失败', skipped: '跳过', error: '错误' };
  return labels[status] || status;
});

export interface ReportOptions {
  projectRoot: string;
  xmlDir?: string;
}

const DEFAULT_XML_DIR = join(
  'backend', 'example', 'example-server', 'target', 'surefire-reports'
);

export function runReport(requirement: string, opts: ReportOptions): string {
  const xmlDir = opts.xmlDir || join(opts.projectRoot, DEFAULT_XML_DIR);

  if (!existsSync(xmlDir)) {
    console.error(`错误: Surefire 报告目录不存在: ${xmlDir}`);
    console.error(`请先运行 mvn test 生成测试报告`);
    process.exit(1);
  }

  // Parse JUnit XML
  const reportCases = parseSurefireReports(xmlDir);
  if (reportCases.length === 0) {
    console.error(`警告: 在 ${xmlDir} 中未找到测试结果`);
  }

  // Load YAML cases for enrichment
  const casesDir = getRequirementCasesDir(opts.projectRoot, requirement);
  const yamlCases = existsSync(casesDir) ? loadCasesFromDir(casesDir) : [];

  // Build report
  const report = buildReport(requirement, reportCases, yamlCases);

  // Load and render template
  const templatePath = new URL('../../templates/report.hbs', import.meta.url);
  const templateSource = readFileSync(templatePath, 'utf-8');
  const template = Handlebars.compile(templateSource);
  const html = template(report);

  // Write output
  const reportsDir = getRequirementReportsDir(opts.projectRoot, requirement);
  mkdirSync(reportsDir, { recursive: true });
  const outputPath = join(reportsDir, `report-${report.generated}.html`);
  writeFileSync(outputPath, html, 'utf-8');

  console.log(`\n=== 测试报告 ===`);
  console.log(`总计: ${report.summary.total}`);
  console.log(`通过: ${report.summary.passed}`);
  console.log(`失败: ${report.summary.failed}`);
  console.log(`跳过: ${report.summary.skipped}`);
  console.log(`错误: ${report.summary.error}`);
  console.log(`耗时: ${report.summary.duration.toFixed(2)}s`);
  console.log(`\n✅ 报告已生成: ${outputPath}`);

  return outputPath;
}
