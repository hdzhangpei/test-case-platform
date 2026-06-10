import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

export interface ProjectConfig {
  repo_key: string;
  test_src: string;
  package: string;
  bootstrap_class: string;
  active_profile: string;
}

export interface FrameworkConfig {
  default_project: string;
  projects: Record<string, ProjectConfig>;
}

export interface RepoEntry {
  git: string;
  branch: string;
  path: string;
  domain: string;
  keywords: string[];
}

let _config: FrameworkConfig | null = null;
let _repos: Record<string, Record<string, RepoEntry>> | null = null;

export function loadConfig(projectRoot: string): FrameworkConfig {
  if (_config) return _config;
  const configPath = join(projectRoot, 'tools', 'api-test-framework', 'config.yaml');
  const raw = readFileSync(configPath, 'utf-8');
  _config = parseYaml(raw) as FrameworkConfig;
  return _config;
}

export function loadRepos(projectRoot: string): Record<string, Record<string, RepoEntry>> {
  if (_repos) return _repos;
  const reposPath = join(projectRoot, 'repos.yaml');
  const raw = readFileSync(reposPath, 'utf-8');
  _repos = parseYaml(raw) as Record<string, Record<string, RepoEntry>>;
  return _repos;
}

export function resolveTestOutputDir(projectRoot: string, projectName?: string): string {
  const config = loadConfig(projectRoot);
  const repos = loadRepos(projectRoot);
  const name = projectName || config.default_project;
  const projectConfig = config.projects[name];
  if (!projectConfig) {
    throw new Error(`项目 "${name}" 未在 config.yaml 中配置`);
  }

  const repoEntry = repos.backend?.[projectConfig.repo_key];
  if (!repoEntry) {
    throw new Error(`repos.yaml 中未找到 backend.${projectConfig.repo_key}`);
  }

  const packageDir = projectConfig.package.replace(/\./g, '/');
  return join(projectRoot, repoEntry.path, projectConfig.test_src, packageDir);
}

export function getProjectConfig(projectRoot: string, projectName?: string): ProjectConfig {
  const config = loadConfig(projectRoot);
  const name = projectName || config.default_project;
  const projectConfig = config.projects[name];
  if (!projectConfig) {
    throw new Error(`项目 "${name}" 未在 config.yaml 中配置`);
  }
  return projectConfig;
}
