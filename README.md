# Studio Album

基于 Next.js 14 + Prisma + MySQL 构建的工作室内部在线相册与证书管理系统，支持成员上传、分类浏览、权限控制以及分享链接访问。

## 功能概览

- 📁 分类管理：管理员可增删改查分类，首页展示分类统计。
- 📷 图片上传：成员可批量上传 JPG/PNG，自动生成缩略图并存储至 `public/uploads`。
- 🧑‍🤝‍🧑 用户体系：支持注册 / 登录，首个注册用户自动成为管理员，可分配成员角色。
- 🔐 权限控制：写操作需登录，管理员拥有分类、用户、分享链接的管理权限。
- 🔗 分享访问：管理员可为分类生成带密码与过期时间的分享链接，访客可通过链接浏览内容。
- 🎛️ 管理后台：统一入口管理分类、成员角色、分享链接。

## 技术栈

- **框架**：Next.js 14（App Router）
- **数据库**：Prisma ORM + MySQL
- **认证**：NextAuth.js（Credentials Provider）
- **样式**：Tailwind CSS 4 + shadcn/ui
- **图片处理**：sharp
- **包管理**：pnpm

## 快速开始

> 想要一步完成依赖安装、数据库初始化与开发服务器启动，可直接运行：
> ```bash
> ./scripts/dev-start.sh
> ```

1. **安装依赖**
   ```bash
   pnpm install
   ```

2. **配置环境变量**（参考 `.env`，默认连接到本地 MySQL）
   ```env
   DATABASE_URL="mysql://album_user:album_password@localhost:3306/cp_album"
   NEXTAUTH_SECRET="your_random_secret"
   NEXTAUTH_URL="http://localhost:3000"
   UPLOAD_PATH="./public/uploads"
   ```

3. **启动数据库**
   - 本地已有 MySQL：确保与 `.env` 一致。
   - 或使用 Docker：
     ```bash
     docker compose up -d mysql
     ```

4. **初始化数据库结构**
   ```bash
   pnpm prisma:push
   ```

5. **生成 Prisma Client（首次或 schema 更新后）**
   ```bash
   pnpm prisma:generate
   ```

6. **启动开发服务器**
   ```bash
   pnpm dev
   ```
   访问 <http://localhost:3000>。

> 首次注册的账号将自动获得 **管理员** 权限；之后的注册用户默认为 **成员**。

## 可选：Docker 一键启动

项目包含用于开发环境的 `docker-compose.yml` 与 `Dockerfile`：

```bash
docker compose up -d
```

- `mysql` 服务提供数据库。
- `studio-album` 服务运行 Next.js 开发服务器（`pnpm dev`）。

## 主要脚本

| 命令                | 说明                          |
| ------------------- | ----------------------------- |
| `c          | 启动开发服务器                |
| `pnpm build`        | 构建生产版本                  |
| `pnpm start`        | 以生产模式启动                |
| `pnpm lint`         | 运行 ESLint 检查              |
| `pnpm prisma:generate` | 重新生成 Prisma Client    |
| `pnpm prisma:push`  | 推送 Prisma schema 至数据库   |

## 目录结构

```
app/                # App Router 页面与 API Route Handlers
components/         # 复用组件（shadcn/ui 风格）
lib/                # 数据库与鉴权工具
prisma/             # Prisma schema 定义
public/uploads/     # 原图与缩略图存储目录
```

## 其他说明

- 上传的原图与缩略图默认存放于仓库的 `public/uploads/` 目录，部署时可替换为对象存储。
- 如果需要允许依赖执行原生构建（如 `sharp`），请根据提示运行 `pnpm approve-builds`。
- 生产环境请务必修改 `NEXTAUTH_SECRET`、MySQL 密码等敏感配置。
