import { Command } from 'commander';
import { resolve } from 'node:path';
import { runValidate } from './commands/validate.js';
import { runReview } from './commands/review.js';
import { runCodegen } from './commands/codegen.js';
import { runReport } from './commands/report.js';
import { runServe } from './commands/serve.js';

const PROJECT_ROOT = resolve(import.meta.dirname, '..', '..', '..');

const program = new Command();

program
  .name('tc')
  .description('数字用户中心 API 测试工作流框架')
  .version('0.1.0');

program
  .command('validate <requirement>')
  .description('校验 YAML 测试用例（Schema + 交叉引用 + 一致性检查）')
  .action((requirement: string) => {
    runValidate(requirement, { projectRoot: PROJECT_ROOT });
  });

program
  .command('review <requirement>')
  .description('生成审查 HTML 页面（Step 1）')
  .action((requirement: string) => {
    runReview(requirement, { projectRoot: PROJECT_ROOT });
  });

program
  .command('codegen <requirement>')
  .description('从 YAML 生成 Java 测试类（Step 2）')
  .option('--force', '跳过校验失败的用例强制生成')
  .option('--project <name>', '目标项目（默认读 config.yaml 的 default_project）')
  .action((requirement: string, opts: { force?: boolean; project?: string }) => {
    runCodegen(requirement, { projectRoot: PROJECT_ROOT, force: opts.force, project: opts.project });
  });

program
  .command('report <requirement>')
  .description('从 Surefire XML 生成测试报告 HTML（Step 3）')
  .option('--xml-dir <path>', 'Surefire 报告目录路径')
  .action((requirement: string, opts: { xmlDir?: string }) => {
    runReport(requirement, { projectRoot: PROJECT_ROOT, xmlDir: opts.xmlDir });
  });

program
  .command('serve <requirement>')
  .description('启动本地审查服务（支持在浏览器中编辑并保存回 YAML）')
  .option('-p, --port <port>', '端口号', '3456')
  .action((requirement: string, opts: { port: string }) => {
    runServe(requirement, { projectRoot: PROJECT_ROOT, port: parseInt(opts.port) });
  });

program
  .command('init <requirement>')
  .description('初始化需求测试目录结构')
  .action((requirement: string) => {
    const { mkdirSync } = require('node:fs');
    const { join } = require('node:path');
    const base = join(PROJECT_ROOT, 'tests', 'integration', requirement);
    const dirs = ['cases', 'review', 'reports', 'fixtures'];
    for (const d of dirs) {
      mkdirSync(join(base, d), { recursive: true });
    }
    console.log(`✅ 已初始化测试目录: ${base}`);
    console.log(`   请将 YAML 用例文件放入 cases/ 目录`);
  });

program.parse();
