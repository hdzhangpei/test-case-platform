# 虚拟数字人（岗位虾）知识蒸馏

> 来源：PRD `[PRD]岗位虾-组织中台主数据建设-2026.04` + 技术方案 `虚拟数字人入驻人岗管理系统（nr-eiam）技术方案`
> 代码仓库：https://git.n.xiaomi.com/nr-mp-govern/nr-eiam

---

## 一、业务背景

### 1.1 核心定位

龙虾正从「个人虾」（个人助理）迈向「岗位虾」（数字员工）阶段。**岗位虾的本质是：给特定岗位配置专属 AI 龙虾，使其成为组织的正式数字员工**。

组织中台（nr-eiam）作为小米组织架构、人员、岗位的主数据管理平台，需要承载「虾」这一新实体的组织挂靠关系管理。

### 1.2 核心职责

- **虾的身份管理**：独立建表，与员工表物理隔离
- **虾-岗位映射**：支持虾与岗位 ID 关联
- **虾-组织挂靠**：支持虾挂载到组织树任意节点

### 1.3 业务领域

当前覆盖 4 个领域：3C、汽车、售后、国际

---

## 二、核心概念

| 名词 | 定义 |
|------|------|
| **岗位虾** | 给特定岗位配置的专属 AI 龙虾（Agent），作为组织的数字员工 |
| **虾塘** | 虾管理平台，负责虾的创建、注册和生命周期管理 |
| **天工** | 权限管理平台，负责为虾分配功能权限（资源包） |
| **agent_id** | 虾塘分配的全局唯一业务 ID，数字人主键（String） |
| **virtual_mi_id** | Passport 生成的虚拟 miId，由虾塘透传（Long） |
| **virtual_email** | Passport 生成的虚拟邮箱，由虾塘透传（String） |
| **资源包** | 一组功能权限的集合（如"查询库存"），天工将其与岗位 ID 映射 |

---

## 三、设计约束

| # | 约束 | 说明 |
|---|------|------|
| 1 | 与真人表完全隔离 | 数字人主数据、岗关系新建表存储 |
| 2 | 与真人缓存完全隔离 | 数字人新建 Redis key |
| 3 | 现有接口不改签名 | 真人查询接口签名不变 |
| 4 | 虚拟 miId/邮箱来源链路 | Passport → 虾塘 → 生成虾即自带虚拟 miId 和邮箱 |
| 5 | 岗位枚举复用 | 数字人和真人复用同一套岗位 ID |
| 6 | 权限相关 | 组织中台提供岗位虾、真人岗位及组织查询 |

---

## 四、数据模型

### 4.1 eiam_digital_user（数字人主数据表）

```sql
CREATE TABLE `eiam_digital_user` (
  `id`                bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `agent_id`          varchar(128) NOT NULL COMMENT '数字人业务ID（虾塘分配，全局唯一）',
  `mi_id`             bigint(20) unsigned NOT NULL DEFAULT '0' COMMENT '虚拟miId',
  `email`             varchar(255) NOT NULL DEFAULT '' COMMENT '虚拟邮箱',
  `name`              varchar(255) NOT NULL DEFAULT '' COMMENT '数字人名称',
  `created_by`        bigint(20) unsigned NOT NULL DEFAULT '0',
  `updated_by`        bigint(20) unsigned NOT NULL DEFAULT '0',
  `create_time`       bigint(20) unsigned NOT NULL DEFAULT '0',
  `update_time`       bigint(20) unsigned NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_agent_id` (`agent_id`),
  UNIQUE KEY `uk_mi_id` (`mi_id`),
  UNIQUE KEY `uk_email` (`email`)
) COMMENT='数字人主数据表';
```

**唯一性约束**：agent_id、mi_id、email 三个字段各自唯一

### 4.2 eiam_digital_user_state_rel（数字人状态表）

```sql
CREATE TABLE `eiam_digital_user_state_rel` (
  `id`                bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `agent_id`          varchar(128) NOT NULL COMMENT '数字人业务ID',
  `scene`             varchar(50) NOT NULL DEFAULT '' COMMENT '场景',
  `user_state`        tinyint(4) NOT NULL DEFAULT '1' COMMENT '0-无效 1-有效',
  `created_by`        bigint(20) unsigned NOT NULL DEFAULT '0',
  `updated_by`        bigint(20) unsigned NOT NULL DEFAULT '0',
  `create_time`       bigint(20) unsigned NOT NULL DEFAULT '0',
  `update_time`       bigint(20) unsigned NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_agent_id_scene` (`agent_id`,`scene`)
) COMMENT='数字人状态数据表';
```

**设计要点**：状态按 (agent_id, scene) 粒度管理，同一数字人在不同场景可独立启停

### 4.3 eiam_digital_user_position_rel（数字人岗位关系表）

```sql
CREATE TABLE `eiam_digital_user_position_rel` (
  `id`                bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `agent_id`          varchar(128) NOT NULL COMMENT '数字人业务ID',
  `scene`             varchar(50) NOT NULL DEFAULT '' COMMENT '场景',
  `area_id`           varchar(20) NOT NULL DEFAULT '' COMMENT '国家/地区',
  `organ_type`        varchar(50) NOT NULL DEFAULT '' COMMENT '机构类型',
  `organ_code`        varchar(20) NOT NULL DEFAULT '' COMMENT '组织编码',
  `position_id`       int(10) unsigned NOT NULL DEFAULT '0' COMMENT '岗位ID（复用PositionEnum）',
  `privilege_state`   int(2) unsigned NOT NULL COMMENT '岗位状态: 0无效/1有效',
  `relation_type`     int(2) unsigned NOT NULL COMMENT '关联方式: 1:按组织ID关联 2:无需关联',
  `created_by`        bigint(20) unsigned NOT NULL DEFAULT '0',
  `updated_by`        bigint(20) unsigned NOT NULL DEFAULT '0',
  `create_time`       bigint(20) unsigned NOT NULL DEFAULT '0',
  `update_time`       bigint(20) unsigned NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `idx_agent_id_scene_organ_code` (`agent_id`, `scene`, `organ_code`)
) COMMENT='数字人岗位关系表（与真人表完全隔离）';
```

**关联方式**：
- `relation_type=1`：按组织 ID 关联，organ_code 有值
- `relation_type=2`：无需关联，organ_code 为空

### 4.4 eiam_digital_user_log（操作日志表）

```sql
CREATE TABLE `eiam_digital_user_log` (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `agent_id`          VARCHAR(64) NOT NULL COMMENT '数字人业务ID',
  `scene`             varchar(50) NOT NULL DEFAULT '' COMMENT '场景',
  `operation_type`    TINYINT NOT NULL COMMENT '1=新增 2=编辑 4=启用 5=禁用',
  `operation_source`  VARCHAR(32) NOT NULL DEFAULT 'admin' COMMENT 'admin/system/scheduled_task',
  `operator`          VARCHAR(64) NOT NULL COMMENT '操作人',
  `operation_detail`  TEXT COMMENT '变更内容描述（JSON格式）',
  `create_time`       BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_agent_id_scene` (`agent_id`,`scene`)
) COMMENT='数字人操作日志表';
```

---

## 五、缓存设计

与真人缓存完全隔离，使用独立 Redis key 前缀：

| 描述 | Key 模板 | Value |
|------|----------|-------|
| email → agentId | `eiam:du:email:%s:agentId` | agentId |
| miId → agentId | `eiam:du:miId:%s:agentId` | agentId |
| agentId → 基础信息 | `eiam:du:agentId:%s:user:info` | JSON（agentId, name, virtualMiId, userState）|
| agentId → 岗位信息 | `eiam:du:scene:%s:agentId:%s:position` | 岗位列表 |

---

## 六、接口设计

### 6.1 管理后台接口（DigitalUserAdminProvider）

| 接口 | 路径 | 说明 |
|------|------|------|
| `pageDigitalUserList` | `/mtop/meta/eiam/admin/digitalUser/pageDigitalUserList` | 分页查询列表 |
| `createDigitalUserMapping` | `/mtop/meta/eiam/admin/digitalUser/createDigitalUserMapping` | 创建映射 |
| `getDigitalUserDetail` | `/mtop/meta/eiam/admin/digitalUser/getDigitalUserDetail` | 查询详情 |
| `updateDigitalUserMapping` | `/mtop/meta/eiam/admin/digitalUser/updateDigitalUserMapping` | 编辑映射 |
| `updateDigitalUserState` | `/mtop/meta/eiam/admin/digitalUser/updateDigitalUserState` | 启用/禁用 |
| `exportDigitalUserList` | `/mtop/meta/eiam/admin/digitalUser/exportDigitalUserList` | 导出 |
| `getDigitalUserLog` | `/mtop/meta/eiam/admin/digitalUser/getDigitalUserLog` | 操作日志 |
| `listPositionClaws` | `/mtop/meta/eiam/admin/digitalUser/listPositionClaws` | 分页查询岗位虾列表（模糊搜索）|

> 国际接口路径：`/mtop/eiam/admin/digitalUser/...`（无 `/meta` 前缀）

**国际接口路径**：`/mtop/eiam/admin/digitalUser/...`（无 `/meta` 前缀）

### 6.2 对外服务接口

**DigitalUserProvider（数字人服务）**

| 接口 | 说明 |
|------|------|
| `getDigitalUserInfo` | 查询数字人详情（供天工、虾塘等下游系统调用）|
| `getRealUserPosition` | 根据 scene 及邮箱查询真人岗位信息（UPC filter 使用）|

**PositionAdminProvider（岗位管理服务）**

| 接口 | 说明 |
|------|------|
| `getOrganTypePositionList` | 根据 scene 查询组织层级列表及当前层级岗位列表（UPC 使用）|

---

## 七、核心业务规则

### 7.1 创建映射（createDigitalUserMapping）

1. **三重唯一性校验**：agentId 全局唯一 → miId 唯一 → 邮箱唯一
2. **跨领域校验**：同一 agentId 不允许在不同领域同时启用
3. **岗位去重规则**：
   - (positionId + areaId) 全局唯一，不允许跨 relationType 出现
   - relationType=1 时，(positionId + areaId + organCode) 不得重复
4. **状态单向约束**：userState=0 时，所有 position.privilegeState 必须为 0
5. **分布式锁**：按 (agentId, miId, email) 三维度加锁防并发

### 7.2 编辑映射（updateDigitalUserMapping）

1. **前置校验**：用户必须存在且在目标场景下已启用
2. **变更检测**：miId/email/岗位列表任一维度有变化才执行更新
3. **新增 scene 校验**：新增 scene 必须与已有 scene 处于同一领域
4. **增量 Diff**：岗位列表全量替换，按 positionId 是否存在自动区分插入/更新

### 7.3 启用/禁用状态（updateDigitalUserState）

- **禁用（userState=0）**：更新数字人状态 + 联动失效该场景下所有岗位关系
- **启用（userState=1）**：仅更新数字人状态，岗位状态不联动
- **跨领域校验**：启用时检查其他领域是否已存在启用记录

### 7.4 组织挂靠方式

| 类型 | 挂靠方式 | 适用场景 |
|------|----------|----------|
| **全国一虾** | 按领域挂靠 | 整个公司共用一只虾 |
| **多店一虾** | 一只虾挂多个组织节点 | 多个门店共用一只虾 |
| **一店一虾** | 一只虾挂一个组织节点 | 每店独立一只虾 |

---

## 八、代码架构

### 8.1 模块分层

```
nr-eiam/
├── nr-eiam-api/          # 对外 Dubbo 接口定义
│   └── provider/DigitalUserProvider.java
├── nr-eiam-admin/        # 管理后台接口定义
│   ├── provider/DigitalUserAdminProvider.java
│   ├── dto/provider/digitaluser/   # 请求 DTO
│   └── vo/provider/digitaluser/    # 响应 VO
├── nr-eiam-domain/       # 领域层（核心业务逻辑）
│   └── core/digitaluser/
│       ├── DigitalUserService.java         # 核心领域服务
│       ├── DigitalUserInfoService.java     # 查询领域服务
│       ├── enums/                          # 枚举
│       ├── gateway/                        # Gateway 接口
│       ├── model/                          # 领域模型
│       └── strategy/                       # 策略
├── nr-eiam-service/      # 应用层（Provider 实现）
│   └── app/admin/provider/DigitalUserAdminProviderImpl.java
├── nr-eiam-infra/        # 基础设施层
│   ├── repository/po/                      # 持久化对象
│   ├── repository/mapper/                  # MyBatis Mapper
│   └── gateway/core/digitaluser/gatewayimpl/  # Gateway 实现
└── nr-eiam-common/       # 公共枚举和工具
```

### 8.2 核心类说明

| 类 | 职责 |
|----|------|
| `DigitalUserService` | 核心领域服务，负责创建/编辑/启停的业务规则处理 |
| `DigitalUserInfoService` | 查询领域服务，负责详情查询的状态聚合 |
| `DigitalUserGateway` | 用户持久化 Gateway 接口 |
| `DigitalUserPositionGateway` | 岗位关系持久化 Gateway 接口 |
| `DigitalUserLogGateway` | 操作日志 Gateway 接口 |
| `DigitalUserInfoGateway` | 状态关系 Gateway 接口 |
| `DigitalUserAdminProvider` | 管理后台 Dubbo 接口 |
| `DigitalUserProvider` | 对外服务 Dubbo 接口 |

### 8.3 关键设计模式

1. **DDD 分层**：领域层通过 Gateway 接口隔离基础设施，遵循依赖倒置
2. **分布式锁**：使用 Redis 分布式锁保证并发安全
3. **虚拟线程**：使用 `VirtualThreadTaskExecutor` 并发调度多个 Gateway 查询
4. **操作日志审计**：所有变更操作统一记录到 `eiam_digital_user_log`

---

## 九、业务场景枚举

```java
public enum SceneEnum {
    // 国内
    NEW_RETAIL_CN("new_retail_cn", "中国区零售通", DomainEnum.CCC),
    NEW_RETAIL_SERVICE("new_retail_service", "售后", DomainEnum.SALES_AFTER),
    NEW_RETAIL_SERVICE_BUSINESS("new_retail_service_business", "售后服务商", DomainEnum.SALES_AFTER),
    NEW_RETAIL_CAR("new_retail_car", "零售通-汽车", DomainEnum.CAR),
    
    // 国际
    NEW_RETAIL("new_retail", "零售通", DomainEnum.INTERNATIONAL),
    DISTRIBUTION_INNER("distribution_inner", "分销通-内部", DomainEnum.INTERNATIONAL),
    DISTRIBUTION_OUTER("distribution_outer", "分销通-外部", DomainEnum.INTERNATIONAL),
    RETAIL_BUSINESS_AUTHORIZE("retail_business_authorize", "零售商授权", DomainEnum.INTERNATIONAL),
    INTERNATIONAL_SALES("international_sales", "国际销售", DomainEnum.INTERNATIONAL),
}
```

---

## 十、上下游系统

| 系统 | 角色 | 交互内容 |
|------|------|----------|
| **虾塘** | 上游 | 提供 agent_id、虚拟 miId、虚拟邮箱 |
| **Passport** | 上游 | 生成虚拟 miId 和邮箱 |
| **天工** | 下游 | 获取虾-岗位映射，建立资源包关联 |
| **零售通/数字门店** | 下游 | 按需区分人/虾 |
| **UPC** | 下游 | 使用岗位信息进行权限鉴权 |

---

## 十一、国内/国际存储策略

- **国内岗位虾**：直接存储在国内库
- **国际岗位虾**：直接存储在国际库
- **跨机房校验**：新增岗位虾映射需校验当前虾 ID 是否已被国内/国际其他战区使用
