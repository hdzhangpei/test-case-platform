import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import Handlebars from 'handlebars';
import { loadCasesFromDir, getRequirementCasesDir } from '../lib/yaml-loader.js';
import { validateCase } from '../lib/schema-validator.js';
import { writeCaseToFile } from '../lib/yaml-writer.js';
import { runReview } from './review.js';
import type { TestCase } from '../lib/types.js';

Handlebars.registerHelper('lowercase', (str: string) => str?.toLowerCase() ?? '');
Handlebars.registerHelper('json', (val: unknown) => val === undefined ? '' : JSON.stringify(val));
Handlebars.registerHelper('escapeAttr', (val: unknown) => {
  const s = val === undefined || val === null ? '' : String(typeof val === 'object' ? JSON.stringify(val) : val);
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
});
Handlebars.registerHelper('eq', (a: unknown, b: unknown) => a === b);

export interface ServeOptions {
  projectRoot: string;
  port?: number;
}

export function runServe(requirement: string, opts: ServeOptions): void {
  const port = opts.port || 3456;
  const casesDir = getRequirementCasesDir(opts.projectRoot, requirement);

  if (!existsSync(casesDir)) {
    console.error(`错误: 用例目录不存在: ${casesDir}`);
    process.exit(1);
  }

  const templatePath = new URL('../../templates/review.hbs', import.meta.url);
  const templateSource = readFileSync(templatePath, 'utf-8');
  const template = Handlebars.compile(templateSource);

  const server = createServer((req, res) => {
    if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
      // Render fresh review page each time
      const html = renderReview(template, casesDir, requirement, opts.projectRoot);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    if (req.method === 'POST' && req.url === '/api/done') {
      // Generate static review HTML snapshot before exiting
      try {
        const outputPath = runReview(requirement, { projectRoot: opts.projectRoot });
        console.log(`\n📄 已生成审查快照: ${outputPath}`);
      } catch (e: any) {
        console.error(`⚠️ 生成审查快照失败: ${e.message}`);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      console.log(`✅ 审查完成，服务已退出`);
      server.close();
      process.exit(0);
      return;
    }

    if (req.method === 'POST' && req.url === '/api/save') {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => { chunks.push(chunk); });
      req.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8');
        try {
          const { caseId, data } = JSON.parse(body) as { caseId: string; data: TestCase };
          const filePath = join(casesDir, `${caseId}.yaml`);
          if (!existsSync(filePath)) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: `文件不存在: ${caseId}.yaml` }));
            return;
          }
          writeCaseToFile(filePath, data);
          console.log(`✅ 已保存: ${caseId}.yaml`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch (e: any) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: e.message }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end('Not Found');
  });

  server.listen(port, () => {
    console.log(`\n🚀 Review 服务已启动: http://localhost:${port}`);
    console.log(`   需求: ${requirement}`);
    console.log(`   用例目录: ${casesDir}`);
    console.log(`   Ctrl+C 退出\n`);
  });
}

function renderReview(
  template: Handlebars.TemplateDelegate,
  casesDir: string,
  requirement: string,
  projectRoot: string
): string {
  const cases = loadCasesFromDir(casesDir);
  const validations = cases.map(c => validateCase(c, cases, projectRoot));

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

  return template(templateData);
}
