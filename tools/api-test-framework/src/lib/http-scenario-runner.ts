import type { HttpScenario, HttpScenarioRunReport, HttpScenarioStepResult, HttpAssertionDef } from './types.js';

export interface HttpScenarioRunOptions {
  baseUrl?: string;
  cookie?: string;
  cookieEnv?: string;
}

interface RunContext {
  fixtures: Record<string, unknown>;
  captures: Record<string, unknown>;
  stepResponses: Record<string, unknown>;
}

export async function runHttpScenario(
  requirement: string,
  scenario: HttpScenario,
  opts: HttpScenarioRunOptions
): Promise<HttpScenarioRunReport> {
  const baseUrl = trimTrailingSlash(opts.baseUrl || scenario.config?.baseUrl || '');
  if (!baseUrl) {
    throw new Error('缺少 baseUrl，请在 scenario.config.baseUrl 或 --base-url 中配置');
  }

  const cookieEnv = opts.cookieEnv || scenario.config?.cookieEnv;
  const cookie = opts.cookie || (cookieEnv ? process.env[cookieEnv] : undefined);
  if (cookieEnv && !cookie) {
    throw new Error(`环境变量 ${cookieEnv} 未设置，无法获取测试 Cookie`);
  }

  const context: RunContext = {
    fixtures: scenario.fixtures || {},
    captures: {},
    stepResponses: {},
  };

  const startedAt = Date.now();
  const steps: HttpScenarioStepResult[] = [];

  for (const step of scenario.steps) {
    const result = await runStep(baseUrl, scenario, step, context, cookie);
    steps.push(result);
    if (result.status === 'failed') break;
  }

  const duration = (Date.now() - startedAt) / 1000;
  const failed = steps.filter(s => s.status === 'failed').length;

  return {
    requirement,
    scenarioId: scenario.metadata.id,
    scenarioName: scenario.metadata.name,
    generated: new Date().toISOString().replace(/[:.]/g, '-'),
    baseUrl,
    summary: {
      total: steps.length,
      passed: steps.length - failed,
      failed,
      duration,
    },
    steps,
  };
}

async function runStep(
  baseUrl: string,
  scenario: HttpScenario,
  step: HttpScenario['steps'][number],
  context: RunContext,
  cookie?: string
): Promise<HttpScenarioStepResult> {
  const startedAt = Date.now();
  const url = `${baseUrl}${resolveTemplate(step.request.path, context)}`;
  const requestBody = resolveValue(step.request.body, context);
  const headers = resolveHeaders({
    ...(scenario.config?.headers || {}),
    ...(step.request.headers || {}),
  }, context);

  if (cookie) headers.cookie = cookie;

  let responseBody: unknown;
  try {
    const response = await fetch(url, {
      method: step.request.method,
      headers,
      body: requestBody === undefined ? undefined : JSON.stringify(requestBody),
    });

    responseBody = await readResponseBody(response);
    const duration = (Date.now() - startedAt) / 1000;

    assertHttpStatus(step, response.status);
    assertResponse(step.expected?.assertions || [], responseBody);
    captureValues(step, responseBody, context);
    context.stepResponses[step.id] = responseBody;

    return {
      id: step.id,
      name: step.name,
      method: step.request.method,
      url,
      status: 'passed',
      httpStatus: response.status,
      duration,
      requestBody,
      responseBody,
    };
  } catch (error) {
    return {
      id: step.id,
      name: step.name,
      method: step.request.method,
      url,
      status: 'failed',
      duration: (Date.now() - startedAt) / 1000,
      requestBody,
      responseBody,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

function assertHttpStatus(step: { expected?: { status?: number } }, httpStatus: number): void {
  const expected = step.expected?.status || 200;
  if (httpStatus !== expected) {
    throw new Error(`HTTP 状态码不符合预期：期望 ${expected}，实际 ${httpStatus}`);
  }
}

function assertResponse(assertions: HttpAssertionDef[] | undefined, responseBody: unknown): void {
  for (const assertion of assertions || []) {
    const actual = getPathValue(responseBody, assertion.target);
    switch (assertion.type) {
      case 'not_null':
        if (actual === undefined || actual === null)
          throw new Error(`断言失败：${assertion.target} 为空`);
        break;
      case 'equals':
        if (actual !== assertion.value)
          throw new Error(`断言失败：${assertion.target} 期望 ${JSON.stringify(assertion.value)}，实际 ${JSON.stringify(actual)}`);
        break;
      case 'contains':
        if (!String(actual ?? '').includes(String(assertion.value)))
          throw new Error(`断言失败：${assertion.target} 不包含 ${assertion.value}`);
        break;
      case 'true':
        if (actual !== true)
          throw new Error(`断言失败：${assertion.target} 不是 true`);
        break;
      case 'false':
        if (actual !== false)
          throw new Error(`断言失败：${assertion.target} 不是 false`);
        break;
      case 'greater_than':
        if (Number(actual) <= Number(assertion.value))
          throw new Error(`断言失败：${assertion.target} 未大于 ${assertion.value}`);
        break;
    }
  }
}

function captureValues(step: { capture?: Record<string, string> }, responseBody: unknown, context: RunContext): void {
  for (const [name, path] of Object.entries(step.capture || {})) {
    context.captures[name] = getPathValue(responseBody, path);
  }
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function resolveHeaders(headers: Record<string, string>, context: RunContext): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    resolved[key] = resolveTemplate(value, context);
  }
  return resolved;
}

function resolveValue(value: unknown, context: RunContext): unknown {
  if (typeof value === 'string') return resolveTemplate(value, context);
  if (Array.isArray(value)) return value.map(item => resolveValue(item, context));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, resolveValue(item, context)]));
  }
  return value;
}

function resolveTemplate(value: string, context: RunContext): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, expression) => {
    const resolved = resolveExpression(expression, context);
    return resolved === undefined || resolved === null ? '' : String(resolved);
  });
}

function resolveExpression(expression: string, context: RunContext): unknown {
  const [scope, ...pathParts] = expression.split(':');
  const path = pathParts.join(':');

  if (scope === 'fixture') return getPathValue(context.fixtures, path);
  if (scope === 'capture') return getPathValue(context.captures, path);
  if (scope === 'step') {
    const [stepId, ...responsePathParts] = pathParts;
    return getPathValue(context.stepResponses[stepId], responsePathParts.join(':'));
  }
  if (scope === 'env') return process.env[path];
  return undefined;
}

function getPathValue(source: unknown, path: string): unknown {
  if (!path || path === '$') return source;
  const normalized = path.replace(/^\$\.?/, '').replace(/\[(\d+)\]/g, '.$1');
  if (!normalized) return source;
  return normalized.split('.').reduce((current: unknown, part: string) => {
    if (current === undefined || current === null) return undefined;
    if (Array.isArray(current)) return current[Number(part)];
    if (typeof current === 'object') return (current as Record<string, unknown>)[part];
    return undefined;
  }, source);
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/$/, '');
}
