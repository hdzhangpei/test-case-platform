import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import Handlebars from 'handlebars';
import { loadCasesFromDir, getRequirementCasesDir } from '../lib/yaml-loader.js';
import { validateCase } from '../lib/schema-validator.js';
import { groupCasesByService, generateJavaClass } from '../lib/java-codegen.js';
import { resolveTestOutputDir, getProjectConfig } from '../lib/config.js';

export interface CodegenOptions {
  projectRoot: string;
  project?: string;
  force?: boolean;
}

export function runCodegen(requirement: string, opts: CodegenOptions): string[] {
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

  // Validate first (codegen refuses if validation fails)
  const validations = cases.map(c => validateCase(c, cases, opts.projectRoot));
  const failed = validations.filter(v => !v.valid);
  if (failed.length > 0 && !opts.force) {
    console.error(`错误: ${failed.length} 个用例校验失败，请先修复后再生成代码`);
    for (const f of failed) {
      console.error(`  ❌ ${f.file}: ${f.errors.map(e => e.message).join('; ')}`);
    }
    console.error(`\n提示: 使用 --force 强制生成（跳过校验失败的用例）`);
    process.exit(1);
  }

  // Resolve output directory from config + repos.yaml
  const outputDir = resolveTestOutputDir(opts.projectRoot, opts.project);
  const projectConfig = getProjectConfig(opts.projectRoot, opts.project);

  // Filter to valid cases only
  const validCases = cases
    .filter((_, i) => validations[i].valid || opts.force)
    .map(c => c.data);

  // Group by service
  const grouped = groupCasesByService(validCases);

  // Load template
  const templatePath = new URL('../../templates/java/test-class.hbs', import.meta.url);
  const templateSource = readFileSync(templatePath, 'utf-8');
  const template = Handlebars.compile(templateSource, { noEscape: true });

  // Generate Java classes
  mkdirSync(outputDir, { recursive: true });

  const generatedFiles: string[] = [];

  for (const [serviceName, serviceCases] of grouped) {
    const javaClass = generateJavaClass(requirement, serviceName, serviceCases, projectConfig.bootstrap_class, projectConfig.active_profile);
    javaClass.packageName = projectConfig.package;
    const java = template(javaClass);
    const outputPath = join(outputDir, `${javaClass.className}.java`);
    writeFileSync(outputPath, java, 'utf-8');
    generatedFiles.push(outputPath);
    console.log(`✅ 生成: ${javaClass.className}.java (${serviceCases.length} 个测试方法)`);
  }

  // Ensure base class exists
  ensureBaseClass(outputDir, projectConfig);

  console.log(`\n共生成 ${generatedFiles.length} 个测试类，位于: ${outputDir}`);
  return generatedFiles;
}

function ensureBaseClass(outputDir: string, config: { package: string; bootstrap_class: string; active_profile: string }): void {
  const baseClassPath = join(outputDir, 'ApiTestBase.java');
  if (existsSync(baseClassPath)) return;

  let baseClassSource = readFileSync(
    new URL('../../templates/java/ApiTestBase.java', import.meta.url),
    'utf-8'
  );
  // Replace placeholders with config values
  baseClassSource = baseClassSource
    .replace(/package com\.example\.generated;/, `package ${config.package};`)
    .replace(/com\.example\.ExampleBootstrap/g, config.bootstrap_class)
    .replace(/@ActiveProfiles\("dev"\)/, `@ActiveProfiles("${config.active_profile}")`);

  writeFileSync(baseClassPath, baseClassSource, 'utf-8');
  console.log(`✅ 生成基类: ApiTestBase.java`);
}
