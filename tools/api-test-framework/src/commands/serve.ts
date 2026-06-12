import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import Handlebars from 'handlebars';
import { loadCasesFromDir, loadScenariosFromDir, getRequirementCasesDir, getRequirementScenariosDir, getRequirementReportsDir } from '../lib/yaml-loader.js';
import { validateCase } from '../lib/schema-validator.js';
import { validateScenario } from '../lib/http-scenario-validator.js';
import { runHttpScenario } from '../lib/http-scenario-runner.js';
import { writeCaseToFile } from '../lib/yaml-writer.js';
import { runReview } from './review.js';
import { stringify } from 'yaml';
import type { TestCase, HttpScenarioRunReport } from '../lib/types.js';

Handlebars.registerHelper('lowercase', (str: string) => str?.toLowerCase() ?? '');
Handlebars.registerHelper('json', (val: unknown) => val === undefined ? '' : JSON.stringify(val));
Handlebars.registerHelper('jsonPretty', (val: unknown) => val === undefined ? '' : JSON.stringify(val, null, 2));
Handlebars.registerHelper('escapeAttr', (val: unknown) => {
  const s = val === undefined || val === null ? '' : String(typeof val === 'object' ? JSON.stringify(val) : val);
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
});
Handlebars.registerHelper('eq', (a: unknown, b: unknown) => a === b);

export interface ServeOptions {
  projectRoot: string;
  port?: number;
  requirement?: string;
}

const runStore = new Map<string, HttpScenarioRunReport>();

const REQUIREMENT_NAMES: Record<string, string> = {
  'digital-user-management': '岗位虾管理一期',
  'digital-user-management-v2': '岗位虾管理二期',
};

function scanRequirements(projectRoot: string): Array<{ id: string; name: string; scenarioCount: number }> {
  const integrationDir = join(projectRoot, 'tests', 'integration');
  if (!existsSync(integrationDir)) return [];
  const dirs = readdirSync(integrationDir, { withFileTypes: true }).filter(d => d.isDirectory() && !d.name.startsWith('.'));
  return dirs.map(d => {
    const scenariosDir = join(integrationDir, d.name, 'scenarios');
    const count = existsSync(scenariosDir) ? readdirSync(scenariosDir).filter(f => f.endsWith('.yaml')).length : 0;
    const name = REQUIREMENT_NAMES[d.name] || d.name;
    return { id: d.name, name, scenarioCount: count };
  }).filter(r => r.scenarioCount > 0);
}

export function runServe(opts: ServeOptions): void {
  const port = opts.port || 3456;
  const projectRoot = opts.projectRoot;

  const templatePath = new URL('../../templates/review.hbs', import.meta.url);
  const templateSource = readFileSync(templatePath, 'utf-8');
  const template = Handlebars.compile(templateSource);

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || '/', `http://localhost:${port}`);
    const pathname = url.pathname;

    // Serve main SPA
    if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
      const reqId = opts.requirement || scanRequirements(projectRoot)[0]?.id || '';
      const html = renderSPA(template, reqId, projectRoot);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache, no-store, must-revalidate' });
      res.end(html);
      return;
    }

    // API: List all requirements
    if (req.method === 'GET' && pathname === '/api/requirements') {
      sendJson(res, { ok: true, requirements: scanRequirements(projectRoot) });
      return;
    }

    // API: Get scenarios for a requirement
    if (req.method === 'GET' && pathname.startsWith('/api/scenarios/')) {
      const reqId = decodeURIComponent(pathname.split('/api/scenarios/')[1]);
      const scenariosDir = getRequirementScenariosDir(projectRoot, reqId);
      const data = getScenariosData(scenariosDir, projectRoot);
      sendJson(res, data);
      return;
    }

    // API: Get scenarios (default requirement)
    if (req.method === 'GET' && pathname === '/api/scenarios') {
      const reqId = url.searchParams.get('req') || opts.requirement || '';
      const scenariosDir = getRequirementScenariosDir(projectRoot, reqId);
      const data = getScenariosData(scenariosDir, projectRoot);
      sendJson(res, data);
      return;
    }

    // API: Save scenario
    if (req.method === 'POST' && pathname === '/api/save-scenario') {
      const body = await readBody(req);
      try {
        const { requirement: reqId, scenarioId, data } = JSON.parse(body) as { requirement: string; scenarioId: string; data: Record<string, unknown> };
        const scenariosDir = getRequirementScenariosDir(projectRoot, reqId);
        const filePath = join(scenariosDir, `${scenarioId}.yaml`);
        if (!existsSync(filePath)) {
          sendJson(res, { ok: false, error: `文件不存在: ${scenarioId}.yaml` }, 404);
          return;
        }
        const yamlStr = stringify(data, { indent: 2, lineWidth: 120 });
        writeFileSync(filePath, yamlStr, 'utf-8');
        console.log(`✅ 已保存场景: ${reqId}/${scenarioId}.yaml`);
        sendJson(res, { ok: true });
      } catch (e: any) {
        sendJson(res, { ok: false, error: e.message }, 400);
      }
      return;
    }

    // API: Create scenario
    if (req.method === 'POST' && pathname === '/api/create-scenario') {
      const body = await readBody(req);
      try {
        const { requirement: reqId, scenarioId, name, tags } = JSON.parse(body) as { requirement: string; scenarioId: string; name: string; tags?: string[] };
        const scenariosDir = getRequirementScenariosDir(projectRoot, reqId);
        const filePath = join(scenariosDir, `${scenarioId}.yaml`);
        if (existsSync(filePath)) {
          sendJson(res, { ok: false, error: `场景已存在: ${scenarioId}.yaml` }, 400);
          return;
        }
        mkdirSync(scenariosDir, { recursive: true });
        const newScenario = {
          version: '2.0',
          metadata: {
            id: scenarioId,
            name,
            requirement: reqId,
            author: 'web',
            created: new Date().toISOString().split('T')[0],
            ...(tags?.length ? { tags } : {}),
          },
          config: {
            baseUrl: '${env:TC_BASE_URL}',
            cookieEnv: 'TC_COOKIE',
            headers: {
              'content-type': 'application/json;charset=UTF-8',
              group: 'staging',
              'x-retail-locale': 'CN',
            },
          },
          steps: [],
        };
        const yamlStr = stringify(newScenario, { indent: 2, lineWidth: 120 });
        writeFileSync(filePath, yamlStr, 'utf-8');
        console.log(`✅ 已创建场景: ${reqId}/${scenarioId}.yaml`);
        sendJson(res, { ok: true });
      } catch (e: any) {
        sendJson(res, { ok: false, error: e.message }, 400);
      }
      return;
    }

    // API: Delete scenario
    if (req.method === 'POST' && pathname === '/api/delete-scenario') {
      const body = await readBody(req);
      try {
        const { requirement: reqId, scenarioId } = JSON.parse(body) as { requirement: string; scenarioId: string };
        const scenariosDir = getRequirementScenariosDir(projectRoot, reqId);
        const filePath = join(scenariosDir, `${scenarioId}.yaml`);
        if (!existsSync(filePath)) {
          sendJson(res, { ok: false, error: `文件不存在: ${scenarioId}.yaml` }, 404);
          return;
        }
        const { unlinkSync } = await import('node:fs');
        unlinkSync(filePath);
        console.log(`🗑️ 已删除场景: ${reqId}/${scenarioId}.yaml`);
        sendJson(res, { ok: true });
      } catch (e: any) {
        sendJson(res, { ok: false, error: e.message }, 400);
      }
      return;
    }

    // API: Run scenario (async)
    if (req.method === 'POST' && pathname === '/api/run-scenario') {
      const body = await readBody(req);
      try {
        const { requirement: reqId, scenarioId } = JSON.parse(body) as { requirement: string; scenarioId: string };
        const scenariosDir = getRequirementScenariosDir(projectRoot, reqId);
        const scenarios = loadScenariosFromDir(scenariosDir);
        const scenario = scenarios.find(s => s.data.metadata.id === scenarioId || s.fileName === scenarioId);
        if (!scenario) {
          sendJson(res, { ok: false, error: `场景不存在: ${scenarioId}` }, 404);
          return;
        }

        const runId = `run-${Date.now()}`;
        const runningReport: HttpScenarioRunReport = {
          requirement: reqId,
          scenarioId: scenario.data.metadata.id,
          scenarioName: scenario.data.metadata.name,
          generated: new Date().toISOString(),
          baseUrl: '',
          summary: { total: scenario.data.steps.length, passed: 0, failed: 0, duration: 0 },
          steps: [],
        };
        runStore.set(runId, runningReport);

        runHttpScenario(reqId, scenario.data, {
          baseUrl: scenario.data.config?.baseUrl?.replace('${env:TC_BASE_URL}', process.env.TC_BASE_URL || ''),
          cookieEnv: scenario.data.config?.cookieEnv,
        }).then(report => {
          runStore.set(runId, report);
          try {
            const reportsDir = getRequirementReportsDir(projectRoot, reqId);
            mkdirSync(reportsDir, { recursive: true });
            const outPath = join(reportsDir, `http-${report.scenarioId}-${report.generated}.json`);
            writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf-8');
          } catch {}
        }).catch(err => {
          runStore.set(runId, { ...runningReport, summary: { ...runningReport.summary, failed: 1 }, steps: [{ id: 'error', name: '执行失败', method: '', url: '', status: 'failed' as const, duration: 0, errorMessage: err.message }] });
        });

        sendJson(res, { ok: true, runId });
      } catch (e: any) {
        sendJson(res, { ok: false, error: e.message }, 400);
      }
      return;
    }

    // API: Run all scenarios serially
    if (req.method === 'POST' && pathname === '/api/run-all') {
      const body = await readBody(req);
      try {
        const { requirement: reqId } = JSON.parse(body) as { requirement: string };
        const scenariosDir = getRequirementScenariosDir(projectRoot, reqId);
        const scenarios = loadScenariosFromDir(scenariosDir);
        if (scenarios.length === 0) {
          sendJson(res, { ok: false, error: '没有可执行的场景' }, 400);
          return;
        }

        const batchId = `batch-${Date.now()}`;
        const batchReport = {
          batchId,
          requirement: reqId,
          total: scenarios.length,
          completed: 0,
          passed: 0,
          failed: 0,
          currentScenario: scenarios[0].data.metadata.name,
          status: 'running' as const,
          results: [] as HttpScenarioRunReport[],
        };
        runStore.set(batchId, batchReport as any);

        // Run serially in background
        (async () => {
          for (let i = 0; i < scenarios.length; i++) {
            const s = scenarios[i];
            const currentBatch = runStore.get(batchId) as any;
            currentBatch.currentScenario = s.data.metadata.name;
            runStore.set(batchId, { ...currentBatch });

            try {
              const report = await runHttpScenario(reqId, s.data, {
                baseUrl: s.data.config?.baseUrl?.replace('${env:TC_BASE_URL}', process.env.TC_BASE_URL || ''),
                cookieEnv: s.data.config?.cookieEnv,
              });
              currentBatch.results.push(report);
              currentBatch.completed = i + 1;
              if (report.summary.failed > 0) currentBatch.failed++;
              else currentBatch.passed++;
              runStore.set(batchId, { ...currentBatch });

              // Save individual report
              try {
                const reportsDir = getRequirementReportsDir(projectRoot, reqId);
                mkdirSync(reportsDir, { recursive: true });
                writeFileSync(join(reportsDir, `http-${report.scenarioId}-${report.generated}.json`), JSON.stringify(report, null, 2), 'utf-8');
              } catch {}
            } catch (err: any) {
              currentBatch.results.push({
                requirement: reqId,
                scenarioId: s.data.metadata.id,
                scenarioName: s.data.metadata.name,
                generated: new Date().toISOString(),
                baseUrl: '',
                summary: { total: 0, passed: 0, failed: 1, duration: 0 },
                steps: [{ id: 'error', name: '执行失败', method: '', url: '', status: 'failed' as const, duration: 0, errorMessage: err.message }],
              });
              currentBatch.completed = i + 1;
              currentBatch.failed++;
              runStore.set(batchId, { ...currentBatch });
            }
          }
          const final = runStore.get(batchId) as any;
          if (final.status === 'running') final.status = 'done';
          runStore.set(batchId, { ...final });

          // Save batch report to disk
          try {
            const reportsDir = getRequirementReportsDir(projectRoot, reqId);
            mkdirSync(reportsDir, { recursive: true });
            const batchReport = {
              type: 'batch',
              batchId,
              requirement: reqId,
              generated: new Date().toISOString(),
              total: final.total,
              passed: final.passed,
              failed: final.failed,
              scenarios: (final.results || []).map((r: any) => ({
                scenarioId: r.scenarioId,
                scenarioName: r.scenarioName,
                status: r.summary.failed > 0 ? 'failed' : 'passed',
                total: r.summary.total,
                passed: r.summary.passed,
                failed: r.summary.failed,
                duration: r.summary.duration,
                steps: (r.steps || []).map((st: any) => ({
                  id: st.id,
                  name: st.name,
                  method: st.method,
                  url: st.url,
                  status: st.status,
                  httpStatus: st.httpStatus,
                  duration: st.duration,
                  requestBody: st.requestBody,
                  responseBody: st.responseBody,
                  errorMessage: st.errorMessage,
                })),
              })),
            };
            writeFileSync(join(reportsDir, `batch-${batchId}.json`), JSON.stringify(batchReport, null, 2), 'utf-8');
          } catch {}
        })();

        sendJson(res, { ok: true, batchId });
      } catch (e: any) {
        sendJson(res, { ok: false, error: e.message }, 400);
      }
      return;
    }

    // API: Get batch run status
    if (req.method === 'GET' && pathname.startsWith('/api/batch-status/')) {
      const batchId = pathname.split('/api/batch-status/')[1];
      const batch = runStore.get(batchId);
      if (!batch) {
        sendJson(res, { ok: false, error: '批次不存在' }, 404);
        return;
      }
      sendJson(res, { ok: true, batch });
      return;
    }

    // API: Get run status
    if (req.method === 'GET' && pathname.startsWith('/api/run-status/')) {
      const runId = pathname.split('/api/run-status/')[1];
      const report = runStore.get(runId);
      if (!report) {
        sendJson(res, { ok: false, error: '运行记录不存在' }, 404);
        return;
      }
      sendJson(res, { ok: true, report });
      return;
    }

    // API: List historical reports
    if (req.method === 'GET' && pathname === '/api/reports') {
      const reqId = url.searchParams.get('req') || opts.requirement || '';
      const reportsDir = getRequirementReportsDir(projectRoot, reqId);
      if (!existsSync(reportsDir)) {
        sendJson(res, { ok: true, reports: [] });
        return;
      }
      // Read batch reports
      const batchFiles = readdirSync(reportsDir).filter(f => f.endsWith('.json') && f.startsWith('batch-')).sort().reverse().slice(0, 20);
      const batchReports = batchFiles.map(f => {
        try {
          const data = JSON.parse(readFileSync(join(reportsDir, f), 'utf-8'));
          return { type: 'batch', file: f, batchId: data.batchId, generated: data.generated, total: data.total, passed: data.passed, failed: data.failed, scenarios: data.scenarios };
        } catch { return null; }
      }).filter(Boolean);
      sendJson(res, { ok: true, reports: batchReports });
      return;
    }

    // API: Get report detail
    if (req.method === 'GET' && pathname.startsWith('/api/report/')) {
      const parts = pathname.split('/api/report/')[1];
      const [reqId, fileName] = parts.split('/');
      const filePath = join(getRequirementReportsDir(projectRoot, reqId), fileName);
      if (!existsSync(filePath)) {
        sendJson(res, { ok: false, error: '报告不存在' }, 404);
        return;
      }
      try {
        sendJson(res, { ok: true, report: JSON.parse(readFileSync(filePath, 'utf-8')) });
      } catch (e: any) {
        sendJson(res, { ok: false, error: e.message }, 500);
      }
      return;
    }

    // API: Validate
    if (req.method === 'POST' && pathname === '/api/validate') {
      const body = await readBody(req);
      const { requirement: reqId } = JSON.parse(body) as { requirement: string };
      const scenariosDir = getRequirementScenariosDir(projectRoot, reqId);
      const scenarios = loadScenariosFromDir(scenariosDir);
      const validations = scenarios.map(s => validateScenario(s, scenarios));
      sendJson(res, { ok: true, validations: validations.map(v => ({ file: v.file, caseId: v.caseId, valid: v.valid, errors: v.errors, warnings: v.warnings })) });
      return;
    }

    // Legacy: POST /api/done
    if (req.method === 'POST' && pathname === '/api/done') {
      sendJson(res, { ok: true });
      server.close();
      process.exit(0);
      return;
    }

    res.writeHead(404);
    res.end('Not Found');
  });

  server.listen(port, () => {
    const reqs = scanRequirements(projectRoot);
    console.log(`\n🚀 测试用例平台已启动: http://localhost:${port}`);
    console.log(`   需求列表: ${reqs.map(r => `${r.name}(${r.scenarioCount}场景)`).join(', ')}`);
    console.log(`   Ctrl+C 退出\n`);
  });
}

function renderSPA(template: Handlebars.TemplateDelegate, requirement: string, projectRoot: string): string {
  const requirements = scanRequirements(projectRoot);
  const scenariosDir = getRequirementScenariosDir(projectRoot, requirement);
  const reportsDir = getRequirementReportsDir(projectRoot, requirement);
  const casesDir = getRequirementCasesDir(projectRoot, requirement);

  const scenarios = existsSync(scenariosDir) ? loadScenariosFromDir(scenariosDir) : [];
  const scenarioValidations = scenarios.map(s => validateScenario(s, scenarios));
  const cases = existsSync(casesDir) ? loadCasesFromDir(casesDir) : [];
  const caseValidations = cases.map(c => validateCase(c, cases, projectRoot));

  const recentReports: Array<{ file: string; scenarioId: string; scenarioName: string; generated: string; summary: any }> = [];
  if (existsSync(reportsDir)) {
    const files = readdirSync(reportsDir).filter(f => f.endsWith('.json') && f.startsWith('http-')).sort().reverse().slice(0, 10);
    for (const f of files) {
      try {
        const data = JSON.parse(readFileSync(join(reportsDir, f), 'utf-8'));
        recentReports.push({ file: f, scenarioId: data.scenarioId, scenarioName: data.scenarioName, generated: data.generated, summary: data.summary });
      } catch {}
    }
  }

  return template({
    requirement,
    requirements,
    requirementsJson: JSON.stringify(requirements),
    generated: new Date().toISOString().split('T')[0],
    totalScenarios: scenarios.length,
    totalSteps: scenarios.reduce((sum, s) => sum + s.data.steps.length, 0),
    scenarioPassedCount: scenarioValidations.filter(v => v.valid).length,
    scenarioFailedCount: scenarioValidations.filter(v => !v.valid).length,
    totalCases: cases.length,
    casePassedCount: caseValidations.filter(v => v.valid && v.warnings.length === 0).length,
    caseFailedCount: caseValidations.filter(v => !v.valid).length,
    scenarios: scenarios.map((s, i) => ({
      id: s.data.metadata.id,
      name: s.data.metadata.name,
      fileName: s.fileName,
      tags: (s.data.metadata.tags || []).join(', '),
      stepCount: s.data.steps.length,
      stepPreviews: s.data.steps.slice(0, 4).map(st => st.name),
      status: scenarioValidations[i].valid ? 'pass' : 'fail',
      errors: scenarioValidations[i].errors,
      configJson: JSON.stringify(s.data.config || {}),
      stepsJson: JSON.stringify(s.data.steps),
      rawJson: JSON.stringify(s.data),
    })),
    cases: cases.map((c, i) => ({
      id: c.data.metadata?.id || c.fileName,
      name: c.data.metadata?.name || '',
      service: c.data.target?.service || '',
      method: c.data.target?.method || '',
      status: caseValidations[i].valid ? (caseValidations[i].warnings.length > 0 ? 'warning' : 'pass') : 'fail',
      errors: caseValidations[i].errors,
      warnings: caseValidations[i].warnings,
      fields: c.data.input?.fields || [],
      assertions: c.data.expected?.assertions || [],
      dataJson: JSON.stringify(c.data),
    })),
    recentReports,
    scenariosJson: JSON.stringify(scenarios.map(s => s.data)),
  });
}

function getScenariosData(scenariosDir: string, projectRoot: string) {
  if (!existsSync(scenariosDir)) return { ok: true, scenarios: [] };
  const scenarios = loadScenariosFromDir(scenariosDir);
  const validations = scenarios.map(s => validateScenario(s, scenarios));
  return {
    ok: true,
    scenarios: scenarios.map((s, i) => ({
      id: s.data.metadata.id,
      name: s.data.metadata.name,
      fileName: s.fileName,
      stepCount: s.data.steps.length,
      valid: validations[i].valid,
      errors: validations[i].errors,
      data: s.data,
    })),
  };
}

function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}
