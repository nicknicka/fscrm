import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Prisma 7 配置：连接串等数据源配置从 schema 移至此文件。
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
});
