export interface TestCase {
  version: '1.0';
  metadata: TestCaseMetadata;
  target: TestCaseTarget;
  setup?: TestCaseSetup;
  input: TestCaseInput;
  invocation: TestCaseInvocation;
  expected: TestCaseExpected;
  cleanup?: TestCaseCleanup;
  notes?: string;
}

export interface TestCaseMetadata {
  id: string;
  name: string;
  requirement: string;
  priority: 'P0' | 'P1' | 'P2';
  group: 'SMOKE' | 'REGRESSION' | 'EDGE_CASE';
  author: string;
  created: string;
  tags?: string[];
}

export interface TestCaseTarget {
  service: string;
  method: string;
  bean_class: string;
}

export interface TestCaseSetup {
  login_user?: { account: string };
  fixtures?: string[];
  preconditions?: Array<{ description: string }>;
}

export interface FieldDef {
  field: string;
  value: unknown;
  type: string;
  items?: Array<{
    constructor_args?: unknown[];
    fields?: FieldDef[];
  }>;
}

export interface TestCaseInput {
  type: string;
  fields: FieldDef[];
  wrapper?: {
    type: string;
    source?: string;
    header_fields?: FieldDef[];
  };
}

export interface TestCaseInvocation {
  style: 'direct' | 'dubbo_reference';
  return_type: string;
}

export interface AssertionDef {
  type: 'not_null' | 'equals' | 'contains' | 'true' | 'false' | 'greater_than';
  target: string;
  value?: unknown;
}

export interface TestCaseExpected {
  assertions: AssertionDef[];
}

export interface TestCaseCleanup {
  fixtures?: string[];
  actions?: Array<{
    method: string;
    args?: string[];
  }>;
}

export interface ValidationResult {
  file: string;
  caseId: string;
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  layer: 'schema' | 'cross_ref' | 'consistency';
  path: string;
  message: string;
}

export interface ValidationWarning {
  layer: 'cross_ref' | 'consistency';
  path: string;
  message: string;
}

// ============================================================
// HTTP 场景类型 (version 2.0)
// ============================================================

export interface HttpScenario {
  version: '2.0';
  metadata: HttpScenarioMetadata;
  config?: HttpScenarioConfig;
  fixtures?: Record<string, unknown>;
  steps: HttpScenarioStep[];
}

export interface HttpScenarioMetadata {
  id: string;
  name: string;
  requirement: string;
  author?: string;
  created?: string;
  tags?: string[];
}

export interface HttpScenarioConfig {
  baseUrl?: string;
  cookieEnv?: string;
  headers?: Record<string, string>;
}

export interface HttpScenarioStep {
  id: string;
  name: string;
  request: HttpScenarioRequest;
  expected?: HttpScenarioExpected;
  capture?: Record<string, string>;
}

export interface HttpScenarioRequest {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface HttpScenarioExpected {
  status?: number;
  assertions?: HttpAssertionDef[];
}

export interface HttpAssertionDef {
  type: 'not_null' | 'equals' | 'contains' | 'true' | 'false' | 'greater_than';
  target: string;
  value?: unknown;
}

export interface HttpScenarioRunReport {
  requirement: string;
  scenarioId: string;
  scenarioName: string;
  generated: string;
  baseUrl: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
    duration: number;
  };
  steps: HttpScenarioStepResult[];
}

export interface HttpScenarioStepResult {
  id: string;
  name: string;
  method: string;
  url: string;
  status: 'passed' | 'failed';
  httpStatus?: number;
  duration: number;
  requestBody?: unknown;
  responseBody?: unknown;
  errorMessage?: string;
}

// ============================================================
// 原有报告类型
// ============================================================

export interface TestReport {
  requirement: string;
  generated: string;
  environment: string;
  summary: ReportSummary;
  cases: ReportCase[];
}

export interface ReportSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  error: number;
  duration: number;
}

export interface ReportCase {
  id: string;
  name: string;
  className: string;
  methodName: string;
  status: 'passed' | 'failed' | 'skipped' | 'error';
  duration: number;
  errorMessage?: string;
  stackTrace?: string;
}
