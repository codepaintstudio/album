# Studio Album

基于 Next.js 15 + Prisma + MySQL 构建的工作室内部在线相册与证书管理系统，支持成员上传、分类浏览、权限控制以及分享链接访问。

## 功能概览

- 📁 **分类管理**：管理员可增删改查分类，支持三种可见性级别（私有、内部、公开），首页展示分类统计
- 📷 **图片上传**：成员可批量上传 JPG/PNG，自动生成缩略图并存储至 `public/uploads`，支持原始文件名保留
- 🧑‍🤝‍🧑 **用户体系**：支持注册/登录，首个注册用户自动成为管理员，可分配成员角色
- 🔐 **权限控制**：
  - 写操作（上传、删除、编辑）需登录
  - 管理员拥有分类、用户、分享链接的完整管理权限
  - 成员只能删除/编辑自己上传的照片
  - 支持分类级别的可见性控制（private/internal/public）
- 🔗 **分享访问**：管理员可为分类生成带密码与过期时间的分享链接，访客可通过链接浏览内容
- 📦 **批量下载**：支持批量选择图片打包下载为 ZIP 文件
- 🎛️ **管理后台**：统一入口管理分类、成员角色、分享链接，支持分类可见性设置
- 🖼️ **响应式设计**：完美适配桌面端和移动端

## 技术栈

- **框架**：Next.js 15（App Router）
- **数据库**：Prisma ORM + MySQL 8.0+
- **认证**：NextAuth.js v4（Credentials Provider）
- **样式**：Tailwind CSS 4 + shadcn/ui
- **图片处理**：sharp（自动生成缩略图）
- **包管理**：pnpm
- **类型检查**：TypeScript 5
- **数据验证**：Zod

## 快速开始

### 方式一：一键启动脚本（推荐）

> 自动完成依赖安装、数据库初始化与开发服务器启动：

```bash
./scripts/dev-start.sh
```

### 方式二：手动步骤

#### 1. 环境要求

- Node.js >= 18.0
- pnpm >= 8.0
- MySQL >= 8.0

#### 2. 安装依赖

```bash
pnpm install
```

#### 3. 配置环境变量

复制 `.env.example` 为 `.env` 并修改配置：

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
# 数据库连接串（必填）
DATABASE_URL="mysql://album_user:album_password@localhost:3306/cp_album"

# NextAuth JWT 签名密钥（必填，生产环境请使用强随机字符串）
# 生成方式：openssl rand -base64 32
NEXTAUTH_SECRET="your_random_secret_here"

# 应用访问地址（开发环境默认即可）
NEXTAUTH_URL="http://localhost:3000"

# 文件上传目录（相对于项目根目录）
UPLOAD_PATH="./public/uploads"
```

#### 4. 启动数据库

**选项 A：使用本地 MySQL**

确保 MySQL 服务已启动，并创建对应的数据库和用户：

```sql
CREATE DATABASE cp_album CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'album_user'@'localhost' IDENTIFIED BY 'album_password';
GRANT ALL PRIVILEGES ON cp_album.* TO 'album_user'@'localhost';
FLUSH PRIVILEGES;
```

**选项 B：使用 Docker**

```bash
docker compose up -d mysql
```

#### 5. 初始化数据库

```bash
# 生成 Prisma Client
pnpm prisma:generate

# 推送数据库 schema（创建表结构）
pnpm prisma:push
```

#### 6. 启动开发服务器

```bash
pnpm dev
```

访问 <http://localhost:3000>

### 首次使用

1. 点击右上角「登录/注册」
2. 首次注册的账号将自动获得 **管理员** 权限
3. 后续注册的用户默认为 **成员** 角色
4. 管理员可在「管理后台」修改用户角色

## Docker 部署

### 开发环境

项目包含用于开发环境的 `docker-compose.yml` 与 `Dockerfile`：

```bash
# 启动所有服务（MySQL + Next.js 开发服务器）
docker compose up -d

# 查看日志
docker compose logs -f studio-album

# 停止所有服务
docker compose down
```

服务说明：
- `mysql`：MySQL 8.0 数据库服务
- `studio-album`：Next.js 开发服务器（`pnpm dev`）

### 生产环境

1. **构建生产版本**

```bash
pnpm build
```

2. **启动生产服务器**

```bash
pnpm start
```

或使用 PM2：

```bash
pm2 start npm --name "studio-album" -- start
```

## 主要脚本

| 命令                      | 说明                                    |
| ------------------------- | --------------------------------------- |
| `pnpm dev`                | 启动开发服务器（默认端口 3000）         |
| `pnpm build`              | 构建生产版本                            |
| `pnpm start`              | 以生产模式启动                          |
| `pnpm lint`               | 运行 ESLint 检查                        |
| `pnpm prisma:generate`    | 生成 Prisma Client（schema 更新后必须） |
| `pnpm prisma:push`        | 推送 Prisma schema 至数据库（同步表结构）|

## 目录结构

```
cp-album/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # 认证相关页面
│   │   ├── login/                # 登录页面
│   │   └── profile/              # 个人资料页面
│   ├── admin/                    # 管理后台
│   ├── album/[id]/               # 分类相册详情页
│   ├── share/[token]/            # 分享链接访问页
│   ├── upload/                   # 图片上传页面
│   ├── api/                      # API Route Handlers
│   │   ├── auth/[...nextauth]/   # NextAuth 认证端点
│   │   ├── categories/           # 分类管理 API
│   │   ├── photos/               # 图片管理 API
│   │   ├── share/                # 分享链接 API
│   │   ├── upload/               # 文件上传 API
│   │   ├── users/                # 用户管理 API
│   │   └── profile/              # 个人资料 API
│   ├── layout.tsx                # 全局布局
│   └── page.tsx                  # 首页（分类列表）
├── components/                   # React 组件
│   ├── ui/                       # shadcn/ui 基础组件
│   ├── admin-dashboard.tsx       # 管理面板
│   ├── navbar.tsx                # 顶部导航栏
│   ├── photo-grid.tsx            # 图片网格展示
│   ├── share-viewer.tsx          # 分享链接浏览器
│   ├── upload-form.tsx           # 上传表单
│   └── ...                       # 其他业务组件
├── lib/                          # 工具库
│   ├── db.ts                     # Prisma 客户端实例
│   ├── auth.ts                   # NextAuth 配置
│   ├── auth-guards.ts            # 权限检查工具
│   ├── storage.ts                # 文件存储工具
│   └── utils.ts                  # 通用工具函数
├── prisma/                       # Prisma ORM
│   └── schema.prisma             # 数据库 schema 定义
├── public/                       # 静态资源
│   └── uploads/                  # 上传文件存储目录
│       └── thumbnails/           # 缩略图目录
├── scripts/                      # 辅助脚本
│   └── dev-start.sh              # 开发环境快速启动脚本
├── .env.example                  # 环境变量示例
├── docker-compose.yml            # Docker Compose 配置
├── Dockerfile                    # Docker 镜像构建文件
├── next.config.ts                # Next.js 配置
├── tailwind.config.ts            # Tailwind CSS 配置
├── tsconfig.json                 # TypeScript 配置
└── package.json                  # 项目依赖
```

## 数据库 Schema

### 核心模型

**User（用户）**
- `id`: 主键
- `username`: 用户名（唯一）
- `password`: 密码（bcrypt 加密）
- `role`: 角色（admin/member）
- `createdAt`: 创建时间

**Category（分类）**
- `id`: 主键
- `name`: 分类名称
- `description`: 分类描述
- `visibility`: 可见性（private/internal/public）
- `createdAt`: 创建时间

**Photo（图片）**
- `id`: 主键
- `filename`: 存储文件名
- `originalName`: 原始文件名
- `description`: 图片描述
- `categoryId`: 所属分类 ID
- `uploaderId`: 上传者 ID
- `createdAt`: 上传时间

**ShareLink（分享链接）**
- `id`: 主键
- `categoryId`: 分类 ID
- `token`: 访问令牌（唯一）
- `password`: 访问密码（可选）
- `expiresAt`: 过期时间（可选）
- `createdAt`: 创建时间

### 可见性级别说明

| 级别 | 说明 | 访问权限 |
|------|------|----------|
| `private` | 私有 | 仅管理员可见 |
| `internal` | 内部 | 所有登录用户可见 |
| `public` | 公开 | 所有人可见（包括未登录） |

## 功能详解

### 用户权限体系

| 操作 | 游客 | 成员 | 管理员 |
|------|------|------|--------|
| 浏览公开分类 | ✅ | ✅ | ✅ |
| 浏览内部分类 | ❌ | ✅ | ✅ |
| 浏览私有分类 | ❌ | ❌ | ✅ |
| 上传图片 | ❌ | ✅ | ✅ |
| 删除自己的图片 | ❌ | ✅ | ✅ |
| 删除他人的图片 | ❌ | ❌ | ✅ |
| 创建/编辑分类 | ❌ | ❌ | ✅ |
| 管理用户角色 | ❌ | ❌ | ✅ |
| 创建分享链接 | ❌ | ❌ | ✅ |

### 图片上传流程

1. 用户选择分类并上传图片（支持多选）
2. 后端验证文件类型（仅支持 JPG/PNG）
3. 生成唯一文件名（UUID + 扩展名）
4. 使用 sharp 生成缩略图（300x300，保持宽高比）
5. 保存原图至 `public/uploads/`
6. 保存缩略图至 `public/uploads/thumbnails/`
7. 记录数据库（包含原始文件名、上传者等信息）

### 分享链接机制

1. 管理员为指定分类创建分享链接
2. 可选配置：
   - 访问密码（为空则无需密码）
   - 过期时间（为空则永久有效）
3. 生成唯一访问 token（UUID）
4. 分享链接格式：`/share/{token}`
5. 访问时验证密码和有效期
6. 验证通过后可浏览该分类下的所有图片

### 批量下载功能

1. 用户勾选多张图片
2. 点击「下载选中」按钮
3. 后端使用 JSZip 打包原图
4. 返回 ZIP 文件流
5. 浏览器自动下载（文件名：`photos-{timestamp}.zip`）

## 安全说明

- 密码使用 bcrypt 加密存储（salt rounds: 10）
- NextAuth 会话使用 JWT，通过 `NEXTAUTH_SECRET` 签名
- API 路由通过 `requireAuth()` 中间件进行权限验证
- 文件上传限制类型和大小（通过 MIME type 检查）
- 分享链接支持密码保护和过期时间
- SQL 注入防护（Prisma ORM 自动参数化查询）

## 常见问题

### 1. 如何生成安全的 `NEXTAUTH_SECRET`？

```bash
openssl rand -base64 32
```

### 2. 如何修改上传文件大小限制？

编辑 `app/api/upload/route.ts`，修改 `maxFileSizeMB` 常量。

### 3. 如何迁移到对象存储（如 S3/OSS）？

替换 `lib/storage.ts` 中的文件存储逻辑，改为调用对象存储 SDK。

### 4. 数据库迁移如何处理？

生产环境建议使用 Prisma Migrate：

```bash
# 创建迁移
npx prisma migrate dev --name init

# 应用迁移
npx prisma migrate deploy
```

### 5. 如何备份数据？

```bash
# 备份数据库
mysqldump -u album_user -p cp_album > backup.sql

# 备份上传文件
tar -czf uploads-backup.tar.gz public/uploads/
```

### 6. sharp 安装失败怎么办？

如果遇到 `sharp` 原生模块编译问题：

```bash
# 批准依赖执行原生构建
pnpm approve-builds

# 重新安装
pnpm install --force
```

## 部署建议

### 生产环境检查清单

- [ ] 修改 `NEXTAUTH_SECRET` 为强随机字符串
- [ ] 修改 MySQL 密码为强密码
- [ ] 设置 `NEXTAUTH_URL` 为实际域名
- [ ] 配置 HTTPS 证书
- [ ] 考虑使用对象存储替代本地文件系统
- [ ] 配置定期数据库备份
- [ ] 启用 CDN 加速静态资源
- [ ] 配置进程守护（PM2/Systemd）
- [ ] 设置防火墙规则
- [ ] 配置日志收集和监控

### 性能优化建议

1. **图片优化**：使用 Next.js Image 组件自动优化
2. **数据库索引**：为常用查询字段添加索引
3. **缓存策略**：使用 Redis 缓存热点数据
4. **CDN 加速**：静态资源和上传图片使用 CDN
5. **懒加载**：图片网格使用虚拟滚动

## 开发指南

### 添加新的 API 路由

```typescript
// app/api/your-route/route.ts
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  const authCheck = await requireAuth();
  if ("error" in authCheck) return authCheck.error;

  // 你的业务逻辑
  const data = await prisma.yourModel.findMany();

  return NextResponse.json(data);
}
```

### 添加新的页面

```typescript
// app/your-page/page.tsx
export default function YourPage() {
  return (
    <div>
      <h1>Your Page</h1>
    </div>
  );
}
```

### 修改数据库 Schema

1. 编辑 `prisma/schema.prisma`
2. 运行 `pnpm prisma:generate`
3. 运行 `pnpm prisma:push`（开发环境）或 `npx prisma migrate dev`（生产环境）

## 贡献指南

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建特性分支（`git checkout -b feature/AmazingFeature`）
3. 提交更改（`git commit -m 'Add some AmazingFeature'`）
4. 推送到分支（`git push origin feature/AmazingFeature`）
5. 开启 Pull Request

## 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件

## 致谢

- [Next.js](https://nextjs.org/) - React 框架
- [Prisma](https://www.prisma.io/) - 数据库 ORM
- [NextAuth.js](https://next-auth.js.org/) - 认证解决方案
- [Tailwind CSS](https://tailwindcss.com/) - CSS 框架
- [shadcn/ui](https://ui.shadcn.com/) - UI 组件库
- [sharp](https://sharp.pixelplumbing.com/) - 图片处理库
