# 数字用户中心 ALL IN CODE

> Meta-Repo — 聚合需求、测试、知识的 Context Hub

## 定位

本仓库是数字用户中心的 **Meta-Repo（元仓库）**，集中管理：

- 变更记录（需求文档、设计方案、变更历史）
- API 测试用例（YAML 格式）及测试产物
- 本地知识库（业务领域/实体/模块/FAQ/SOP）
- 工程脚本 & 工具（含 API 测试框架）

**服务代码** 保留在各自内部仓中，通过 `bootstrap.sh` 拉取到本地，可见、可编辑、可运行，但提交/发布走内部仓流程。

## 入口

| 角色 | 入口文件 |
|------|----------|
| 人类 | 本文件（README.md） |
| AI Agent | `AGENTS.md` |

## 快速开始

```bash
# 安装 yq（首次）
brew install yq    # macOS
# 或参考 https://github.com/mikefarah/yq

# 拉取所有服务代码
bash bootstrap.sh

# 只拉取特定服务
bash bootstrap.sh <service-name>
```

## 目录总览

| 路径 | 用途 |
|------|------|
| `repos.yaml` | 服务注册表（唯一事实源） |
| `bootstrap.sh` | 按 repos.yaml 拉取/更新内部仓 |
| `backend/` | 后端微服务（bootstrap 产物，不跟踪） |
| `frontend/` | 前端项目（bootstrap 产物，不跟踪） |
| `tests/` | API 测试用例（YAML）及产物（审查 HTML、报告 HTML） |
| `tools/` | 工程脚本 & CLI 工具（含 API 测试框架） |
| `changesets/` | 变更记录（需求/PRD/设计，按月归档） |
| `knowledge/` | 本地知识库（领域/实体/模块/FAQ/SOP） |

## 核心原则

1. **代码归内部仓，上下文归外层仓** — repos.yaml 是唯一事实源
2. **接口变更必须同步 changesets 中的设计文档**
3. **需求变更追加记录，不覆盖原始描述**
4. **API 测试用真依赖** — @SpringBootTest + 真实 DB/Redis/RPC，不 mock

## API 测试

工具：`tools/api-test-framework/`（[详见其 README.md](tools/api-test-framework/README.md)）

```bash
cd tools/api-test-framework && npm install

# 完整流程
npx tsx src/cli.ts init <需求名>          # 初始化目录
npx tsx src/cli.ts validate <需求名>      # 校验 YAML 用例
npx tsx src/cli.ts serve <需求名>         # 启动本地审查服务（浏览器实时编辑）
npx tsx src/cli.ts codegen <需求名>       # 生成 Java 测试类
npx tsx src/cli.ts report <需求名>        # 生成测试报告
```

### serve — 在线审查与编辑

`tc serve` 启动一个本地 HTTP 服务（默认端口 3456），在浏览器中提供用例审查和编辑能力：

- **实时渲染**：每次刷新页面重新加载用例并执行 4 层校验，展示通过/警告/失败状态
- **在线编辑**：直接在页面上修改用例内容，点击保存即写回对应的 YAML 文件
- **完成退出**：点击"审查完成"按钮，自动生成审查快照 HTML 并关闭服务

典型工作流：`validate` 校验通过 → `serve` 人工审查修改 → 确认无误后点击完成 → `codegen` 生成代码

## 技术栈

| 层级 | 技术 |
|------|------|
| 语言 | JDK 21 |
| 框架 | Spring Boot + Apache Dubbo |
| 注册/配置 | Nacos |
| 构建 | Maven |
| 部署 | miline |
