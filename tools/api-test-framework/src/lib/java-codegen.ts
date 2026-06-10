import type { TestCase, FieldDef, AssertionDef } from './types.js';

export interface JavaClass {
  className: string;
  packageName: string;
  imports: string[];
  serviceName: string;
  serviceClass: string;
  serviceField: string;
  bootstrapClass: string;
  bootstrapSimple: string;
  activeProfile: string;
  methods: JavaMethod[];
}

export interface JavaMethod {
  methodName: string;
  caseId: string;
  caseName: string;
  priority: string;
  group: string;
  mvnCommand: string;
  setupCode: string;
  inputCode: string;
  invocationCode: string;
  assertionCode: string;
  logCode: string;
}

export function groupCasesByService(cases: TestCase[]): Map<string, TestCase[]> {
  const map = new Map<string, TestCase[]>();
  for (const c of cases) {
    const key = c.target.service;
    const arr = map.get(key) || [];
    arr.push(c);
    map.set(key, arr);
  }
  return map;
}

export function generateJavaClass(
  requirement: string,
  serviceName: string,
  cases: TestCase[],
  bootstrapClass = 'com.example.ExampleBootstrap',
  activeProfile = 'dev'
): JavaClass {
  const reqPascal = toPascalCase(requirement);
  const className = `Generated${reqPascal}_${serviceName}Test`;
  const packageName = 'com.example.generated';
  const bootstrapSimple = getSimpleClassName(bootstrapClass);

  const imports = collectImports(cases);
  imports.push(bootstrapClass);
  imports.sort();
  const serviceClass = cases[0].target.bean_class;
  const serviceField = toLowerFirst(serviceName);

  const methods: JavaMethod[] = cases.map(c => generateMethod(c, className));

  return { className, packageName, imports, serviceName, serviceClass, serviceField, bootstrapClass, bootstrapSimple, activeProfile, methods };
}

function generateMethod(c: TestCase, className: string): JavaMethod {
  const caseId = c.metadata.id;
  const methodName = `test_${caseId.replace(/-/g, '_')}`;
  const mvnCommand = `mvn test -pl example-server -Dtest=${className}#${methodName} -Pdev`;

  const setupCode = generateSetup(c);
  const inputCode = generateInput(c);
  const invocationCode = generateInvocation(c);
  const assertionCode = generateAssertions(c);
  const logCode = `logResult("${caseId}", result);`;

  return {
    methodName,
    caseId,
    caseName: c.metadata.name,
    priority: c.metadata.priority,
    group: c.metadata.group,
    mvnCommand,
    setupCode,
    inputCode,
    invocationCode,
    assertionCode,
    logCode,
  };
}

function generateSetup(c: TestCase): string {
  const lines: string[] = [];
  if (c.setup?.login_user) {
    lines.push(`setupLoginUser("${c.setup.login_user.account}");`);
  }
  return lines.join('\n        ');
}

function generateInput(c: TestCase): string {
  const lines: string[] = [];
  const simpleType = getSimpleClassName(c.input.type);
  const varName = 'req';

  lines.push(`${simpleType} ${varName} = new ${simpleType}();`);

  for (const field of c.input.fields) {
    const setter = `${varName}.set${toUpperFirst(field.field)}`;
    const valueExpr = generateValueExpression(field);
    lines.push(`${setter}(${valueExpr});`);
  }

  if (c.input.wrapper) {
    const wrapperType = getSimpleClassName(c.input.wrapper.type);
    lines.push('');
    lines.push(`${wrapperType} request = new ${wrapperType}();`);

    if (c.input.wrapper.header_fields) {
      const headerType = 'ModifyHeader'; // TODO: 替换为本项目的请求头类型
      lines.push(`${headerType} header = createHeader();`);
      for (const hf of c.input.wrapper.header_fields) {
        if (hf.value === 'UUID' || hf.value === 'NOW') continue;
        const hSetter = `header.set${toUpperFirst(hf.field)}`;
        lines.push(`${hSetter}(${generateValueExpression(hf)});`);
      }
      lines.push(`request.setHeader(header);`);
    }
    lines.push(`request.setData(${varName});`);
    if (c.input.wrapper.source) {
      lines.push(`request.setSource("${c.input.wrapper.source}");`);
    }
  }

  return lines.join('\n        ');
}

function generateInvocation(c: TestCase): string {
  const returnType = getSimpleReturnType(c.invocation.return_type);
  const serviceField = toLowerFirst(c.target.service);
  const method = c.target.method;
  const arg = c.input.wrapper ? 'request' : 'req';

  return `${returnType} result = ${serviceField}.${method}(${arg});`;
}

function generateAssertions(c: TestCase): string {
  const lines: string[] = [];
  for (const a of c.expected.assertions) {
    lines.push(generateAssertion(a));
  }
  return lines.join('\n        ');
}

function generateAssertion(a: AssertionDef): string {
  const target = a.target === 'result' ? 'result' : a.target;
  switch (a.type) {
    case 'not_null':
      return `Assert.assertNotNull(${target});`;
    case 'equals':
      if (typeof a.value === 'number') {
        if (Number.isInteger(a.value)) {
          return `Assert.assertEquals(${a.value}, (int) ${target});`;
        }
        return `Assert.assertEquals(${a.value}, ${target}, 0.001);`;
      }
      if (typeof a.value === 'string') {
        return `Assert.assertEquals("${a.value}", ${target});`;
      }
      return `Assert.assertEquals(${JSON.stringify(a.value)}, ${target});`;
    case 'true':
      return `Assert.assertTrue(${target});`;
    case 'false':
      return `Assert.assertFalse(${target});`;
    case 'contains':
      return `Assert.assertTrue(${target}.contains(${JSON.stringify(a.value)}));`;
    case 'greater_than':
      return `Assert.assertTrue(${target} > ${a.value});`;
    default:
      return `// TODO: unsupported assertion type: ${a.type}`;
  }
}

function generateValueExpression(field: FieldDef): string {
  const { value, type } = field;

  if (value === 'UUID') return 'java.util.UUID.randomUUID().toString()';
  if (value === 'NOW') return 'System.currentTimeMillis()';

  if (type === 'String') return `"${value}"`;
  if (type === 'Long' && typeof value === 'number') return `${value}L`;
  if (type === 'Integer' || type === 'int') return `${value}`;
  if (type === 'Boolean' || type === 'boolean') return `${value}`;
  if (type === 'Double' || type === 'double') return `${value}D`;

  if (type.startsWith('List<Integer>') && Array.isArray(value)) {
    return `Arrays.asList(${(value as number[]).join(', ')})`;
  }
  if (type.startsWith('List<Long>') && Array.isArray(value)) {
    return `Arrays.asList(${(value as number[]).map(v => v + 'L').join(', ')})`;
  }
  if (type.startsWith('List<String>') && Array.isArray(value)) {
    return `Arrays.asList(${(value as string[]).map(v => `"${v}"`).join(', ')})`;
  }

  if (field.items && field.items.length > 0) {
    const itemType = extractGenericType(type);
    const itemExprs = field.items.map(item => {
      if (item.constructor_args) {
        const args = item.constructor_args.map(a => a === null ? 'null' : `"${a}"`).join(', ');
        return `new ${itemType}(${args})`;
      }
      return `new ${itemType}()`;
    });
    return `Arrays.asList(${itemExprs.join(', ')})`;
  }

  if (Array.isArray(value)) {
    return `Arrays.asList(${(value as unknown[]).map(v => JSON.stringify(v)).join(', ')})`;
  }

  return String(value);
}

function collectImports(cases: TestCase[]): string[] {
  const imports = new Set<string>();
  imports.add('org.junit.Assert');
  imports.add('org.junit.Test');
  imports.add('org.springframework.beans.factory.annotation.Autowired');
  imports.add('java.util.Arrays');

  for (const c of cases) {
    imports.add(c.target.bean_class);
    imports.add(c.input.type);
    if (c.input.wrapper) {
      imports.add(c.input.wrapper.type);
    }
    // Import return type (extract base class from generic)
    const returnBase = c.invocation.return_type.replace(/<.*>/, '');
    if (returnBase.includes('.')) {
      imports.add(returnBase);
    }
  }

  return Array.from(imports).sort();
}

function getSimpleClassName(fqcn: string): string {
  const parts = fqcn.split('.');
  return parts[parts.length - 1];
}

function getSimpleReturnType(returnType: string): string {
  const match = returnType.match(/([^.]+(?:<[^>]+>)?)$/);
  return match ? match[1] : returnType;
}

function extractGenericType(type: string): string {
  const match = type.match(/List<(.+)>/);
  if (match) return getSimpleClassName(match[1]);
  return 'Object';
}

function toPascalCase(s: string): string {
  return s.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
}

function toUpperFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function toLowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}
