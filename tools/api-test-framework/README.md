# API 测试工作流框架

> 从 PRD 到测试报告的 3 步自动化管线

## 工作流概览

```
PRD/需求 → [AI 生成] → YAML 用例 → [审查 HTML] → 人工确认
                                                        ↓
HTML 报告 ← [Step 3] ← mvn test ← Java 测试类 ← [Step 2: codegen]
```

## 快速开始

```bash
cd tools/api-test-framework
npm install

# 1. 初始化需求测试目录
npx tsx src/cli.ts init <requirement-name>

# 2. 生成/放入 YAML 用例到 tests/integration/<requirement>/cases/

# 3. 校验
npx tsx src/cli.ts validate <requirement>

# 4. 生成审查页面
npx tsx src/cli.ts review <requirement>

# 5. 人工审查完毕后，生成 Java 测试类
npx tsx src/cli.ts codegen <requirement>

# 6. 运行测试
cd ../../backend/<service>/<service>-server
mvn test -Dtest="Generated*" -Pdev

# 7. 生成测试报告
cd ../../../tools/api-test-framework
npx tsx src/cli.ts report <requirement>
```

## 命令详解

| 命令 | 说明 | 输出 |
|------|------|------|
| `tc init <req>` | 初始化需求目录结构 | `tests/integration/<req>/{cases,review,reports,fixtures}/` |
| `tc validate <req>` | 4 层校验 YAML 用例 | 控制台输出校验结果 |
| `tc serve <req>` | 启动本地审查服务（浏览器实时编辑） | `http://localhost:3456` |
| `tc review <req>` | 生成静态审查 HTML 快照 | `tests/integration/<req>/review/review-<date>.html` |
| `tc codegen <req>` | YAML → Java 测试类 | `backend/.../generated/Generated*Test.java` |
| `tc report <req>` | Surefire XML → 报告 | `tests/integration/<req>/reports/report-<date>.html` |

### serve — 在线审查与编辑

`tc serve` 启动一个本地 HTTP 服务（默认端口 3456），在浏览器中提供用例的可视化审查和在线编辑能力。

**核心功能：**

- **实时渲染**：每次刷新页面重新加载用例目录，执行 4 层校验，展示通过/警告/失败状态
- **在线编辑**：在页面上直接修改用例字段，点击保存即写回对应的 YAML 文件（`POST /api/save`）
- **完成退出**：点击"审查完成"按钮，自动调用 `review` 生成静态审查快照 HTML，然后关闭服务（`POST /api/done`）

**使用方式：**

```bash
# 启动（默认 http://localhost:3456）
npx tsx src/cli.ts serve <requirement>

# 指定端口
npx tsx src/cli.ts serve <requirement> --port 8080
```

**API 端点：**

| 端点 | 方法 | 说明 |
|------|------|------|
| `/` | GET | 渲染审查页面（每次请求重新加载用例） |
| `/api/save` | POST | 保存用例修改，body: `{caseId, data}` |
| `/api/done` | POST | 生成审查快照并退出服务 |

**典型工作流：**

```
validate 校验通过 → serve 人工审查修改 → 点击"审查完成" → codegen 生成代码
```

## YAML 用例格式

每个用例一个文件，文件名 = 用例 ID（如 `<requirement>-001.yaml`）。

核心字段：
- `metadata`: ID、名称、需求名、优先级(P0/P1/P2)、分组(SMOKE/REGRESSION/EDGE_CASE)
- `target`: 被测 Service 名、方法名、完整类路径
- `input`: DTO 类型、字段列表（支持嵌套对象和包装器）
- `expected`: 断言列表（not_null/equals/contains/true/false/greater_than）

完整 Schema 见: `schema/test-case.schema.json`

## 准确性保障

4 层校验机制：
1. **JSON Schema**: 结构完整性、必填字段、枚举值
2. **交叉引用**: 验证 bean_class/DTO/method 在源码中存在
3. **一致性**: 文件名=ID、ID 不重复、断言表达式合法
4. **人工审查**: HTML 页面展示校验结果，人工确认

## 生成的 Java 类

- 位置: `backend/<service>/<service>-server/src/test/java/<package>/generated/`
- 类名: `Generated{需求PascalCase}_{Service}Test`
- 基类: `ApiTestBase`（提供 setupLoginUser、createHeader、assertSuccess 等工具方法）
- 框架: JUnit 4 + SpringRunner + @SpringBootTest

## AI 生成用例

使用 Skill `/generate-api-cases`:
```
/generate-api-cases <requirement>
```

详见: `skills/generate-api-cases/SKILL.md`

## 目录结构

```
tools/api-test-framework/
├── schema/test-case.schema.json    # YAML 验证 Schema
├── templates/
│   ├── review.hbs                  # 审查页面模板
│   ├── report.hbs                  # 测试报告模板
│   └── java/
│       ├── test-class.hbs          # Java 类模板
│       └── ApiTestBase.java        # 基类源码
├── src/
│   ├── cli.ts                      # CLI 入口
│   ├── commands/                   # 4 个命令实现
│   └── lib/                        # 核心库
└── skills/
    └── generate-api-cases/SKILL.md # AI Skill
```
