# 持续集成（CI）

CI 是每次改动都必须通过的**质量门**：无论 push 还是发起 Pull Request，GitHub Actions 都会在干净的机器上重跑一遍现有的质量检查，任何一环失败即工作流失败，PR 上显示为红色检查项，阻止合并。

工作流定义见 [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)。

## 触发条件

- **push**：任意分支推送
- **pull_request**：任意 PR 的创建与更新

同一分支的新推送会取消仍在运行的上一次工作流（`concurrency`），节省等待时间。

## 执行内容

| 步骤     | 命令                | 作用                                         |
| -------- | ------------------- | -------------------------------------------- |
| 测试     | `npm test`          | 运行 Vitest 全量单元 / 集成测试              |
| 类型检查 | `npm run typecheck` | `next typegen` 生成路由类型后 `tsc --noEmit` |
| Lint     | `npm run lint`      | ESLint 检查                                  |
| 构建     | `npm run build`     | `next build` 生产构建，验证能真正构建成功    |

以上命令**全部复用 `package.json` 中的现有 scripts**，CI 不维护第二套检查命令。直接调用的 script 本身不会出现 `pre` / `post` 钩子问题，因为它们都没有定义。⚠️ 注意 `typecheck` 依赖 `next typegen`；本地不要直接跑裸 `tsc`，否则可能因为缺少 `.next/types` 而报错。

## 环境

- **Node.js**：取自 `package.json` 的 `engines.node`（`>=26`），保证 CI 与本地大版本一致。
- **依赖安装**：`npm ci --ignore-scripts`，严格按 `package-lock.json` 安装；`setup-node` 开启 npm 缓存，命中 `package-lock.json` 时跳过重复下载。
- **Prisma 客户端**：生成产物 `src/generated/prisma/` 已入库，CI 无需执行 `prisma generate`，也不需要连接数据库。
- **不使用任何真实凭证**：工作流**不创建 `.env.local`**，也不注入任何 secret。仓库里没有可作为依赖的敏感环境变量：
  - `src/lib/db/client.test.ts` 中的数据库冒烟测试会在 `DATABASE_URL` 缺失时自动跳过（`it.runIf`），其余测试全部运行；
  - `next build` 在无 `.env.local` 时同样能成功构建（凭证缺失时页面走“未配置”分支，而不是构建期报错）。

  因此 CI 里**不要**为了“凑齐变量”注入假的 `DATABASE_URL`——那会唤醒本应跳过的数据库冒烟测试，让它在 CI 上真实连库并失败。

## 本地等价操作

提交前想跑一遍与 CI 完全相同的检查：

```bash
npm ci            # 或 npm install
npm test
npm run typecheck
npm run lint
npm run build
```

也可以只跑最常用的两项：

```bash
npm test && npm run typecheck
```

要在没有 `.env.local` 的情况下复核 CI 行为：

```bash
mv .env.local .env.local.bak   # 临时移走
npm test && npm run build
mv .env.local.bak .env.local   # 记得移回
```

## 与 pre-commit 的关系

本地 `.husky/pre-commit` 已跑 lint-staged（Prettier）、`npm run typecheck` 与 `npm test`，属于“提交前快速反馈”；CI 在此基础上补上 `npm run lint` 与 `npm run build`，“推上去之后再跑一遍”才是合入前的最终判定。

## 排查常见失败

| 现象                               | 常见原因                                       | 处理                                                  |
| ---------------------------------- | ---------------------------------------------- | ----------------------------------------------------- |
| CI 与本地结果不一致                | Node 版本不同 / 本地有 `.env.local` 掩盖了问题 | 核对 `engines.node`，按上文临时移走 `.env.local` 复现 |
| `typecheck` 报找不到 `.next/types` | 跳过了 `next typegen`                          | 走 `npm run typecheck`，别直接 `tsc`                  |
| `npm test` 中数据库用例变红        | 环境里误设了 `DATABASE_URL`                    | 移除该变量，CI 不应连接真实数据库                     |
| `npm ci` 失败                      | `package-lock.json` 与 `package.json` 不一致   | 本地 `npm install` 后提交更新后的 lockfile            |
