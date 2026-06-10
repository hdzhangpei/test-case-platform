# 数字用户中心 ALL IN CODE — 工程导航手册

> **读者**: AI Agent（Claude / Gemini / Copilot 等）
> **人类入口**: 请先阅读 `README.md`

---

## 1. 仓库定位

本仓库是 **Meta-Repo（元仓库）**，定位为 Context Hub：

- 聚合变更记录（需求/设计）、跨服务测试、知识库、工程工具
- **不直接管理服务源码**——源码留在各自内部仓，通过 `bootstrap.sh` 拉取到本地可见、可编辑、可运行
- 代码提交/发布走内部仓流程，本仓只跟踪"胶水"文件

---

## 2. Bootstrap

```bash
# 首次 / 全量拉取
bash bootstrap.sh

# 只拉某个服务
bash bootstrap.sh <service-name>
```

**前置依赖**: `yq`（macOS: `brew install yq`）

执行后，`repos.yaml` 中列出的仓库将被克隆到 `backend/`、`frontend/` 对应路径。

---

## 3. 目录结构

| 路径 | 用途 | 外层跟踪 |
|------|------|----------|
| `repos.yaml` | 服务注册表（唯一事实源） | ✅ |
| `bootstrap.sh` | 拉取/更新内部仓 | ✅ |
| `backend/` | 后端微服务（bootstrap 产物） | ❌ |
| `frontend/` | 前端项目（bootstrap 产物） | ❌ |
| `tests/` | API 测试用例（YAML）及产物（HTML） | ✅ |
| `tools/` | 工程脚本 & CLI（含 API 测试框架） | ✅ |
| `changesets/` | 变更记录（需求/PRD/设计，按月归档） | ✅ |
| `knowledge/` | 本地知识库 | ✅ |

---

## 4. 快速导航工作流

**从需求找代码**：

```
用户提到业务关键词
    ↓
匹配 repos.yaml 中 keywords 字段 → 定位服务
    ↓
读 changesets/<月份>/<需求名>/ → 获取需求背景和设计上下文
    ↓
追踪跨服务调用 → grep -r "DubboReference" --include="*.java" backend/
    ↓
查看测试覆盖 → tests/integration/<需求名>/cases/*.yaml
```

---

## 5. changesets 变更记录

需求/PRD 以代码形式管理，按月归档：

```
changesets/
├── YYYY-MM/
│   ├── 需求名称/
│   │   ├── prd.md             # 需求文档
│   │   ├── design.md          # 设计方案
│   │   └── changelog.md       # 变更记录
│   └── ...
└── README.md
```

### 核心原则

- 需求变更时**追加记录**，不覆盖原始描述——历史对理解演进很重要
- 验收标准要足够具体，可据此生成测试用例
- 形成可追溯链：需求 → 设计 → 代码 → 测试

---

## 6. 本地知识库（knowledge/）

```
knowledge/
├── AGENTS.md       # 知识库导航
├── index.md        # 知识索引
├── overview.md     # 项目总览
├── domains/        # 业务领域知识
├── entities/       # 实体定义（核心业务实体）
├── modules/        # 模块说明
├── systems/        # 系统说明（上下游依赖）
├── faq/            # 常见问题
└── sop/            # 标准操作流程
```

**使用方式**：

- 直接跟踪在本仓中，无需额外 bootstrap
- 回答业务问题前先搜索 `knowledge/` 已有知识
- 发现知识缺失时直接补充并更新 `index.md`
- 知识页聚焦架构级认知，不复制代码实现

---

## 7. API 测试工作流

### 工具位置

`tools/api-test-framework/` — Node.js + TypeScript CLI 工具

### 工作流（3 步）

```
PRD/需求 → AI 生成 YAML 用例 → tc serve 在线审查编辑 → tc codegen 生成 Java 类 → mvn test → tc report 生成报告
```

### 目录结构

```
tests/integration/<需求名>/
├── cases/          # YAML 用例（一文件一用例，文件名=用例ID）
├── fixtures/       # 前置/清理 SQL 脚本（可选）
├── review/         # 审查快照 HTML（审查完成时自动生成）
└── reports/        # 测试报告 HTML（执行完测试后生成）
```

### CLI 命令

| 命令 | 用途 |
|------|------|
| `tc init <需求>` | 初始化需求测试目录 |
| `tc validate <需求>` | 4 层校验 YAML 用例 |
| `tc serve <需求>` | 启动本地审查服务（可编辑 + 保存回 YAML） |
| `tc review <需求>` | 生成审查快照 HTML |
| `tc codegen <需求>` | YAML → Java 测试类 |
| `tc report <需求>` | Surefire XML → 测试报告 HTML |

### 核心原则

1. **真依赖优先**：@SpringBootTest + 真实 DB/Redis/RPC，不 mock
2. **禁止 CI 自动跑**：依赖 dev 在线服务，CI 自动跑会假失败
3. **用例即文档**：YAML 用例是可读的测试规格，审查 HTML 是存档
4. **准确性保障**：Schema 校验 + 交叉引用（验证类/方法存在） + 一致性检查 + 人工审查
5. **生成代码留内部仓**：`tc codegen` 输出到 `backend/.../generated/`，本仓只存 YAML 和 HTML

### 用例命名规则

- 格式：`<需求名>-<3位序号>.yaml`
- 示例：`<需求名>-001.yaml`、`<需求名>-002.yaml`

### AI 生成用例

使用 Skill：`tools/api-test-framework/skills/generate-api-cases/SKILL.md`

---

## 8. 开发规范

### DO

- 开发前先运行 `bash bootstrap.sh`
- 新需求落地前在 `changesets/` 创建需求文档和设计方案
- 修改业务逻辑后同步更新 `changesets/` 中对应的设计文档
- 新需求完成设计后用 `tc init <需求>` 创建测试目录，生成 YAML 用例
- 用 `tc serve` 审查用例 → `tc codegen` 生成 Java 类 → `mvn test` → `tc report` 生成报告
- 发现知识缺失时补充 `knowledge/` 并更新索引

### DON'T

- ❌ 向外层仓提交服务代码（所有 `backend/*/`、`frontend/*/` 被 .gitignore 屏蔽）
- ❌ 不读 changesets 中的需求/设计就写代码
- ❌ 不经协调修改其他服务的接口
- ❌ 在 CI 中自动运行 API 测试
- ❌ 覆盖需求原始描述（应追加变更记录）
- ❌ 手动编写 generated/ 目录下的 Java 测试类（应通过 `tc codegen` 生成）

---

## 9. 技术栈

| 层级 | 技术 |
|------|------|
| 语言 | JDK 21 |
| 框架 | Spring Boot + Apache Dubbo |
| 注册/配置 | Nacos |
| 构建 | Maven |
| 部署 | miline（各内部仓自管） |
| YAML 解析 | yq（bootstrap 使用） |
