# 数据库迁移说明

本文件说明 fscrm 的数据库结构如何演进：日常开发用 `prisma migrate dev`，生产升级用 `prisma migrate deploy`，以及历史上用 `prisma db push` 的库如何平滑过渡到迁移。

数据库为 PostgreSQL，结构与 `prisma/schema.prisma` 一一对应；连接串通过 `prisma.config.ts` 从环境变量 `DATABASE_URL` 读取（见 [.env.example](../.env.example)）。

## 结论速览

| 场景 | 命令 | 说明 |
| --- | --- | --- |
| 生产 / 预发升级 | `npx prisma migrate deploy` | 只按顺序执行 `prisma/migrations/` 下尚未应用的迁移，不生成、不重置、不改数据 |
| 本地开发改结构 | `npx prisma migrate dev --name <名字>` | 生成新迁移文件并立即应用到本地库，同时重新生成客户端 |
| 本地从零建库 | `npx prisma migrate deploy` | 干净库一次性应用全部迁移，用于验证迁移链完整 |
| 快速试错（可选） | `npm run db:push` | 直接把 schema 推到库，不产生迁移文件；不用于需要留痕的环境 |
| 重新生成客户端 | `npm run db:generate` | 迁移后同步 `src/generated/prisma` |

## 迁移目录

```
prisma/
├── schema.prisma               # 结构的唯一事实来源
└── migrations/
    ├── migration_lock.toml     # 锁定 provider = "postgresql"，勿手改
    ├── 20261121120000_init/    # 首次基线迁移，覆盖当前全部模型与枚举
    │   └── migration.sql
    └── 20261122090000_add_oauth_state/  # OAuth state 一次性存储表（#46）
        └── migration.sql
```

- 一个迁移一个目录，目录名是 `<UTC 时间戳>_<名字>`，**已提交的迁移不再修改**：线上已按它执行过，改了就与线上结构不一致。
- `migration_lock.toml` 固定数据库类型为 `postgresql`；切换数据库类型才需要改它。
- 迁移由 Prisma 记录在库里的 `_prisma_migrations` 表（含校验和、是否完成、回滚信息），`deploy` 据此判断哪些还没执行。

### 首次基线迁移

`20261121120000_init` 是**基线**：它等价于「当前 schema 从空库建起的全部 DDL」，覆盖 9 个枚举与 12 张表：

`departments`、`users`、`customers`、`contacts`、`leads`、`opportunities`、`follow_ups`、`quotations`、`quotation_items`、`contracts`、`orders`、`payments`。

枚举：`CustomerLevel`、`CustomerLifecycle`、`UserRole`、`OpportunityStage`、`LeadStatus`、`FollowUpMode`、`QuotationStatus`、`ContractStatus`、`OrderStatus`。

### 增量迁移

| 迁移 | 内容 | 说明 |
| --- | --- | --- |
| `20261121120000_init` | 9 个枚举 + 12 张业务表 | 基线，等价于当前 schema 从空库建起 |
| `20261122090000_add_oauth_state` | 新建 `oauth_states` 表（`state` 唯一、`expiresAt` 索引） | 飞书登录的一次性 state 校验从进程内 `Map` 改为共享存储，多实例部署下重放同样被拒（#46）；过期行在每次消费时回收，部署约束见 [docs/DEPLOYMENT.md](DEPLOYMENT.md) 第 9.4 节 |

生成方式（离线也可用，不需要连数据库）：在 schema 未改动的前提下，基线 SQL 由空库到 schema 的差异脚本产生。Prisma 7 中对应的命令是：

```bash
npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script
# 旧版 Prisma（6 及以前）写作：--to-schema-datamodel prisma/schema.prisma
```

该命令要求 `DATABASE_URL` 可被 `prisma.config.ts` 解析，但**不会真的连接数据库**，随便给一个合法格式的连接串即可。

## 生产升级：`migrate deploy`

`migrate deploy` 是生产环境的唯一正确入口。它做的事很少：按时间戳顺序执行尚未应用的迁移，写 `_prisma_migrations` 记录，失败即停止。它**不会**重置数据库、不会提示交互、不会删除已有数据。

推荐的上线流程：

1. **先备份**：升级前对目标库做一次快照或 `pg_dump`。
2. **在干净库预演**：对一份临时库执行 `migrate deploy`，确认迁移链能从零跑通（见下文「验证步骤」）。
3. **执行 deploy**：以生产环境为该库的环境变量运行 `prisma migrate deploy`；命令非零退出即视为升级失败，不要继续发布应用。
4. **发布应用**：新代码与迁移应当配套发布，先迁移后发布应用，避免新代码读到旧结构。
5. **核对状态**：`npx prisma migrate status` 显示全部迁移已应用。

如果 `deploy` 报「迁移已应用的记录与本地文件不一致」（校验和不符），说明有人改过已提交的迁移文件或库里被手工改过——不要跳过，先查清原因；特殊情况下的标记手段见下文 `migrate resolve`。

### 生产里不要做的事

- 不要在生产运行 `migrate dev`：它会尝试创建影子库、可能提示重置数据库，还可能顺手生成新迁移。
- 不要在生产运行 `db push`：它按 schema「对齐」现有库，可能丢数据（见下节）。
- 不要手工在线上改结构后不做记录：之后 Prisma 会认为迁移未应用，结构从此对不上。

## 本地开发：`migrate dev`

```bash
# 改完 prisma/schema.prisma 后
npx prisma migrate dev --name add_xxx   # 等价于 npm run db:migrate（但不带名字，会交互询问）
npm run db:generate                     # 生成客户端类型，供 src/ 使用
```

`migrate dev` 会：对比 schema 与本地库 → 生成一个新的迁移目录 → 应用到本地库 → 重新生成客户端。开发期结构反复改动时若提示需要重置，按提示确认即可，**这只影响本地库**。

新迁移文件同样要提交进仓库；评审时重点看生成的 SQL 是否会丢数据（例如 `DROP COLUMN`、类型收窄、加非空列却没有默认值）。

## `db push` 与迁移的区别

| | `prisma db push` | 迁移（`migrate dev` / `migrate deploy`） |
| --- | --- | --- |
| 产物 | 无 | 版本化的 `migration.sql`，进仓库 |
| 依据 | 当前 schema | 已提交的迁移文件 |
| 可复现 | 否：同一 schema 在不同时刻推到不同旧结构的库上结果不同 | 是：干净库按顺序执行即得到确定结构 |
| 可审计 / 可回溯 | 否 | 是：每步变更有时间戳、SQL 与记录 |
| 数据安全 | 可能为对齐结构而丢数据 | 由你审过的 SQL 决定，可控 |
| 多环境一致性 | 靠人肉保证 | Prisma 记录保证 |
| 适用 | 个人原型、临时库、一次性试做 | 预发 / 生产、团队协作 |

一句话：**`db push` 是「让库变成 schema 的样子」，迁移是「记录库是怎样一步一步变成现在的样子」。** 需要别人（或未来的自己）能重放出同样的库，就必须用迁移。

## 从 `db push` 过渡到迁移

已有的库（包括开发机上的 `fscrm` 库和已经用 `db push` 建起来的环境）结构已经等于当前 schema，但没有任何迁移记录。直接运行 `migrate deploy` 会因为基线迁移里的 `CREATE TABLE` 撞上已存在的表而失败。

正确做法是让 Prisma **把基线记为已应用**，而不是真的再执行一遍：

```bash
# 1. 确认这个库的结构与基线迁移描述的结构一致（重要，先做）
npx prisma migrate diff \
  --from-config-datasource \
  --to-schema prisma/schema.prisma \
  --script
# 输出「-- This is an empty migration.」才说明两者结构一致，可以继续下一步

# 2. 把基线标记为已应用（只写 _prisma_migrations 记录，不改表结构）
npx prisma migrate resolve --applied 20261121120000_init

# 3. 核对
npx prisma migrate status
```

要点：

- `migrate resolve --applied` **不会**核对结构，只写记录。所以第 1 步的差异检查不能省——若结构确实不一致，应先手工把库改成与 schema 一致（或用 `db push` 补平），再标记。
- 标记完成后，这个库从此走迁移流程：后续结构变更由 `migrate dev` 生成迁移、由 `migrate deploy` 应用。
- 若某个环境的结构与基线不一致且数据可以丢弃（例如临时测试库），直接把库建成空的再 `migrate deploy` 更省事。
- 只标记**基线**这一个迁移。之后新增的迁移一律走 `deploy`，不要用 `resolve` 跳过。

## 验证步骤

改动或新增迁移后，按下述方式自证：

```bash
# 1. 迁移链能从空库一次跑通（用一份临时库，别用业务库）
createdb fscrm_mig_check
DATABASE_URL='postgresql://<user>@localhost:5432/fscrm_mig_check?schema=public' \
  npx prisma migrate deploy

# 2. 迁移目录与 schema 完全一致（无漂移）
DATABASE_URL='postgresql://<user>@localhost:5432/fscrm_mig_check?schema=public' \
  npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
# 期望输出：-- This is an empty migration.

# 3. 表与枚举确实建出来了
psql -d fscrm_mig_check -c '\dt'
psql -d fscrm_mig_check -At -c \
  "select t.typname from pg_type t join pg_enum e on e.enumtypid = t.oid group by 1 order by 1;"

# 4. 清理临时库
dropdb fscrm_mig_check
```

第 2 步是关键：它证明「迁移执行后的结构」与「schema 描述的结构」没有偏差，即迁移文件既完整又没有多出 schema 里不存在的东西。

## 回滚

Prisma 不生成 down 迁移。回滚的做法有两种：

- **向前修**（推荐）：再写一个迁移抵消上一个迁移的改动，与正常变更一样走 `deploy`。生产数据不回滚，只修正结构。
- **恢复快照**：用升级前的数据库备份恢复，并把应用回退到对应版本。适合迁移本身出错、需要整体退回的情形。

因此升级前的备份与迁移 SQL 评审是唯一可靠的保障。

## 相关

- 模型与关联的决策背景见 [docs/adr/0003-business-depth-model-and-permissions.md](adr/0003-business-depth-model-and-permissions.md)。
- 部署与环境变量见 [README.md](../README.md) 与 [.env.example](../.env.example)。
