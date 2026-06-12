import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import Handlebars from 'handlebars';

Handlebars.registerHelper('json', (val) => val === undefined ? '' : JSON.stringify(val));
Handlebars.registerHelper('escapeAttr', (val) => {
  const s = val === undefined || val === null ? '' : String(typeof val === 'object' ? JSON.stringify(val) : val);
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
});
Handlebars.registerHelper('eq', (a, b) => a === b);

const PROJECT_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const DOCS_DIR = join(PROJECT_ROOT, 'docs');
const INTEGRATION_DIR = join(PROJECT_ROOT, 'tests', 'integration');

const REQUIREMENT_NAMES = {
  'digital-user-management': '岗位虾管理一期',
  'digital-user-management-v2': '岗位虾管理二期',
};

function scanRequirements() {
  if (!existsSync(INTEGRATION_DIR)) return [];
  const dirs = readdirSync(INTEGRATION_DIR, { withFileTypes: true }).filter(d => d.isDirectory() && !d.name.startsWith('.'));
  return dirs.map(d => {
    const scenariosDir = join(INTEGRATION_DIR, d.name, 'scenarios');
    const count = existsSync(scenariosDir) ? readdirSync(scenariosDir).filter(f => f.endsWith('.yaml')).length : 0;
    const name = REQUIREMENT_NAMES[d.name] || d.name;
    return { id: d.name, name, scenarioCount: count };
  }).filter(r => r.scenarioCount > 0);
}

function loadScenarios(reqId) {
  const scenariosDir = join(INTEGRATION_DIR, reqId, 'scenarios');
  if (!existsSync(scenariosDir)) return [];
  const files = readdirSync(scenariosDir).filter(f => f.endsWith('.yaml')).sort();
  return files.map(f => {
    const raw = readFileSync(join(scenariosDir, f), 'utf-8');
    return parseYaml(raw);
  });
}

function loadBatchReports(reqId) {
  const reportsDir = join(INTEGRATION_DIR, reqId, 'reports');
  if (!existsSync(reportsDir)) return [];
  const files = readdirSync(reportsDir).filter(f => f.endsWith('.json') && f.startsWith('batch-')).sort().reverse().slice(0, 10);
  return files.map(f => {
    try { return JSON.parse(readFileSync(join(reportsDir, f), 'utf-8')); } catch { return null; }
  }).filter(Boolean);
}

function build() {
  const requirements = scanRequirements();
  const defaultReq = requirements[0]?.id || '';
  const scenarios = loadScenarios(defaultReq);
  const batchReports = loadBatchReports(defaultReq);

  const templatePath = join(PROJECT_ROOT, 'tools/api-test-framework/templates/review.hbs');
  const templateSource = readFileSync(templatePath, 'utf-8');
  const template = Handlebars.compile(templateSource);

  const scenarioValidations = scenarios.map(() => ({ valid: true, errors: [], warnings: [] }));

  const templateData = {
    requirement: defaultReq,
    requirements,
    requirementsJson: JSON.stringify(requirements),
    generated: new Date().toISOString().split('T')[0],
    totalScenarios: scenarios.length,
    totalSteps: scenarios.reduce((sum, s) => sum + (s.steps?.length || 0), 0),
    scenarioPassedCount: scenarios.length,
    scenarioFailedCount: 0,
    scenarios: scenarios.map((s, i) => ({
      id: s.metadata?.id || `scenario-${i}`,
      name: s.metadata?.name || '',
      fileName: s.metadata?.id || '',
      tags: (s.metadata?.tags || []).join(', '),
      stepCount: s.steps?.length || 0,
      stepPreviews: (s.steps || []).slice(0, 4).map(st => st.name || ''),
      status: 'pass',
      errors: [],
      configJson: JSON.stringify(s.config || {}),
      stepsJson: JSON.stringify(s.steps || []),
      rawJson: JSON.stringify(s),
    })),
    cases: [],
    recentReports: batchReports.map(r => ({
      file: `batch-${r.batchId}.json`,
      scenarioId: r.batchId,
      scenarioName: `批量执行 ${r.total} 场景`,
      generated: r.generated,
      summary: { total: r.total, passed: r.passed, failed: r.failed, duration: 0 },
    })),
    scenariosJson: JSON.stringify(scenarios),
  };

  const html = template(templateData);

  // Inject static mode flag and batch reports data
  const staticHtml = html.replace(
    'const STATE = {',
    `const STATIC_MODE = true;\nconst BATCH_REPORTS = ${JSON.stringify(batchReports)};\nconst STATE = {`
  ).replace(
    "async function switchRequirement(reqId) {",
    `async function switchRequirement(reqId) {
  if (STATIC_MODE) {
    const reqData = REQUIREMENTS.find(r => r.id === reqId);
    if (!reqData) return;
    showToast('success', '静态模式: ' + (reqData.name || reqId));
    return;
  }`
  ).replace(
    "async function runScenario(scenarioId) {",
    `async function runScenario(scenarioId) {
  if (STATIC_MODE) { showToast('error', '静态模式不支持执行，请使用 tc serve'); return; }`
  ).replace(
    "async function runAllScenarios() {",
    `async function runAllScenarios() {
  if (STATIC_MODE) { showToast('error', '静态模式不支持执行，请使用 tc serve'); return; }`
  ).replace(
    "async function saveScenario() {",
    `async function saveScenario() {
  if (STATIC_MODE) { showToast('error', '静态模式不支持保存'); return; }`
  ).replace(
    "async function createScenario() {",
    `async function createScenario() {
  if (STATIC_MODE) { showToast('error', '静态模式不支持创建'); return; }`
  ).replace(
    "async function deleteScenario(scenarioId, scenarioName) {",
    `async function deleteScenario(scenarioId, scenarioName) {
  if (STATIC_MODE) { showToast('error', '静态模式不支持删除'); return; }`
  );

  mkdirSync(DOCS_DIR, { recursive: true });
  writeFileSync(join(DOCS_DIR, 'index.html'), staticHtml, 'utf-8');
  console.log(`✅ 静态站点已生成: ${join(DOCS_DIR, 'index.html')}`);
  console.log(`   需求: ${requirements.length} 个`);
  console.log(`   场景: ${scenarios.length} 个`);
  console.log(`   报告: ${batchReports.length} 个批次`);
}

build();
