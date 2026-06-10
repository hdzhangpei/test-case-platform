---
name: generate-api-cases
description: 从 PRD/需求文档生成结构化 YAML API 测试用例，输出到 tests/integration/<requirement>/cases/
---

# /generate-api-cases

## 触发场景

- 用户提供 PRD、需求描述，并要求生成测试用例
- 用户说"为 XXX 需求生成 API 测试用例"
- 用户说"根据这个设计文档生成测试"

## 输入

| 参数 | 必填 | 说明 |
|------|------|------|
| requirement | 是 | 需求名（kebab-case），对应 `tests/integration/<requirement>/` |
| prd_path | 否 | PRD 文件路径（默认搜索 `changesets/` 下匹配的需求） |
| scope | 否 | 限定范围（如只测某个 Service） |

## 工作流

### Phase 1: 理解需求

1. 读取 PRD 文档：
   - 搜索 `changesets/YYYY-MM/<requirement>/prd.md`
   - 搜索 `changesets/YYYY-MM/<requirement>/design.md`
2. 提取涉及的 API 操作：增/删/改/查/批量
3. 识别验收标准和边界条件

### Phase 2: 确认接口签名

1. 扫描 `backend/<service>/<service>-api/src/main/java/<package>/api/` 找到对应 Service 接口
2. 读取接口方法签名，确认：
   - 方法名
   - 参数 DTO 类全路径
   - 返回值类型
3. 扫描 DTO 类源码，确认所有字段名和类型
4. 如果有 `CommonModifyRequest` 包装器，确认 Header 结构

### Phase 3: 生成用例

为每个 API 操作生成以下覆盖：

| 优先级 | 分组 | 场景 |
|--------|------|------|
| P0 | SMOKE | 正常路径（所有必填字段有效值） |
| P0 | REGRESSION | 必填字段缺失 |
| P1 | REGRESSION | 无效参数（类型错误、超长、特殊字符） |
| P1 | EDGE_CASE | 边界值（空列表、最大值、零值） |
| P2 | EDGE_CASE | 权限/认证异常 |

### Phase 4: 写入文件

1. 确保目录存在：`tests/integration/<requirement>/cases/`
2. 每个用例一个文件，命名：`<requirement>-{001..NNN}.yaml`
3. 严格遵循 Schema 格式（见下方）

### Phase 5: 校验

运行校验确认生成质量：
```bash
cd tools/api-test-framework && npx tsx src/cli.ts validate <requirement>
```

## YAML Schema 格式（必须严格遵循）

```yaml
version: "1.0"

metadata:
  id: "<requirement>-<3位序号>"    # 必须与文件名一致
  name: "中文用例名称"
  requirement: "<requirement>"    # 必须与目录名一致
  priority: P0                    # P0 | P1 | P2
  group: SMOKE                    # SMOKE | REGRESSION | EDGE_CASE
  author: "<当前用户>"
  created: "<当天日期 YYYY-MM-DD>"
  tags: ["tag1", "tag2"]

target:
  service: "ServiceName"          # 接口名（不含包名）
  method: "methodName"            # 方法名
  bean_class: "com.example.api.xxx.ServiceName"  # 完整类路径

setup:
  login_user:
    account: "test_account"        # 测试账号
  fixtures: []                    # 前置 SQL（可选）

input:
  type: "com.example.dto.xxx.DtoClassName"  # DTO 完整路径
  fields:                         # 按 DTO 字段逐一赋值
    - field: "fieldName"
      value: <对应值>
      type: "Java类型"            # String | Integer | Long | List<Integer> 等
  wrapper:                        # 若方法参数是 CommonModifyRequest 则需要
    type: "com.example.dto.common.CommonModifyRequest"
    source: "common"
    header_fields:
      - field: "requestId"
        value: "UUID"
        type: "String"

invocation:
  style: "direct"                 # direct（@Autowired 注入调用）
  return_type: "com.xiaomi.youpin.infra.rpc.Result<Long>"

expected:
  assertions:                     # 至少 1 条断言
    - type: "not_null"            # not_null | equals | contains | true | false | greater_than
      target: "result"
    - type: "equals"
      target: "result.getCode()"
      value: 0

cleanup:
  fixtures: []

notes: |
  mvn test -pl <service>-server -Dtest=Generated<Req>_<Service>Test#test_<id_underscored> -Pdev
```

## 准确性规则（强制）

1. **bean_class 必须存在**：在 `backend/<service>/` 中 grep 确认
2. **DTO 字段必须真实**：读取 DTO 源文件，只用实际存在的 setter
3. **方法签名必须匹配**：确认参数个数和类型与接口定义一致
4. **不猜测不编造**：未确认的类名/方法名必须先搜索确认
5. **ID 格式严格**：`<requirement>-<3位数字>`，从 001 开始递增

## 禁止行为

- 不使用不存在的类名或方法名
- 不编造字段名（必须从 DTO 源码确认）
- 不跳过 version: "1.0" 字段
- 不在 metadata.id 中使用大写或下划线
- 不将多个用例写入同一个文件

## 输出检查清单

- [ ] 每个文件格式正确（通过 JSON Schema 校验）
- [ ] 文件名 = metadata.id + .yaml
- [ ] bean_class 在源码中确认存在
- [ ] input.type DTO 在源码中确认存在
- [ ] 字段名与 DTO 实际字段对应
- [ ] 至少覆盖 P0 SMOKE 正常路径
- [ ] notes 中包含完整 mvn 命令
