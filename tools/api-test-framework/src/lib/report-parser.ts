import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import type { ReportCase, ReportSummary, TestReport } from './types.js';
import type { LoadedCase } from './yaml-loader.js';

interface SurefireTestSuite {
  '@_name': string;
  '@_tests': string;
  '@_errors': string;
  '@_failures': string;
  '@_skipped': string;
  '@_time': string;
  testcase: SurefireTestCase | SurefireTestCase[];
}

interface SurefireTestCase {
  '@_name': string;
  '@_classname': string;
  '@_time': string;
  failure?: { '@_message': string; '@_type': string; '#text'?: string };
  error?: { '@_message': string; '@_type': string; '#text'?: string };
  skipped?: unknown;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
});

export function parseSurefireReports(xmlDir: string): ReportCase[] {
  const files = readdirSync(xmlDir).filter(f => f.startsWith('TEST-') && f.endsWith('.xml'));
  const cases: ReportCase[] = [];

  for (const file of files) {
    const content = readFileSync(join(xmlDir, file), 'utf-8');
    const parsed = parser.parse(content);
    const suite: SurefireTestSuite = parsed.testsuite;
    if (!suite || !suite.testcase) continue;

    const testcases = Array.isArray(suite.testcase) ? suite.testcase : [suite.testcase];
    for (const tc of testcases) {
      let status: ReportCase['status'] = 'passed';
      let errorMessage: string | undefined;
      let stackTrace: string | undefined;

      if (tc.skipped !== undefined) {
        status = 'skipped';
      } else if (tc.error) {
        status = 'error';
        errorMessage = tc.error['@_message'];
        stackTrace = tc.error['#text'];
      } else if (tc.failure) {
        status = 'failed';
        errorMessage = tc.failure['@_message'];
        stackTrace = tc.failure['#text'];
      }

      cases.push({
        id: extractCaseId(tc['@_name']),
        name: tc['@_name'],
        className: tc['@_classname'],
        methodName: tc['@_name'],
        status,
        duration: parseFloat(tc['@_time'] || '0'),
        errorMessage,
        stackTrace,
      });
    }
  }

  return cases;
}

export function buildReport(
  requirement: string,
  cases: ReportCase[],
  yamlCases: LoadedCase[]
): TestReport {
  // Enrich report cases with YAML metadata
  for (const rc of cases) {
    const matched = yamlCases.find(yc => yc.data.metadata?.id === rc.id);
    if (matched) {
      rc.name = matched.data.metadata.name;
    }
  }

  const summary: ReportSummary = {
    total: cases.length,
    passed: cases.filter(c => c.status === 'passed').length,
    failed: cases.filter(c => c.status === 'failed').length,
    skipped: cases.filter(c => c.status === 'skipped').length,
    error: cases.filter(c => c.status === 'error').length,
    duration: cases.reduce((sum, c) => sum + c.duration, 0),
  };

  return {
    requirement,
    generated: new Date().toISOString().split('T')[0],
    environment: 'dev',
    summary,
    cases,
  };
}

function extractCaseId(methodName: string): string {
  // test_my_req_001 → my-req-001
  if (methodName.startsWith('test_')) {
    const withoutPrefix = methodName.slice(5);
    // Convert last group of digits to -NNN format
    const parts = withoutPrefix.split('_');
    const numPart = parts[parts.length - 1];
    if (/^\d{3}$/.test(numPart)) {
      return parts.slice(0, -1).join('-') + '-' + numPart;
    }
    return withoutPrefix.replace(/_/g, '-');
  }
  return methodName;
}
