# 文件上传流程优化设计方案

## 现状

目前的文件上传是经典的「三明治」模式：

```
前端 → 后端 server → TOS 桶
```

所有文件流都经过后端，吃带宽、吃内存、吃并发。

这套模式在「小文件 + 低频」场景下没问题，但随着用户量起来、文件变大，问题会逐渐浮上来：

- 大视频传一半断了，白传
- 后端内存飙升
- 高峰期并发受限

## 痛点

列一下目前流程的几个卡点：

1. **带宽劫持**  
   所有上传流量都要经过后端服务器，相当于给服务器加了「中转站」。100MB 文件，用户传 100MB，服务器也要收 100MB 再发 100MB。

2. **内存压力**  
   当前实现是 `file.arrayBuffer()` → `Buffer.from()`，大文件直接吃满内存。

3. **缩略图瓶颈**  
   图片上传后要 Sharp 处理，这一步必须后端做，但文件流已经在后端了，没法跳过。

4. **上传体验单一**  
   没有分片上传、没有断点续传、没有进度反馈（只有前端自己算的）。

## 方案：Presigned URL 直传

核心思路很简单：**后端只管「签字」，不管「搬货」**。

```
┌─────────────────────────────────────────────────────────────┐
│                      用户上传流程                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. 前端 → POST /api/upload/token                           │
│     认证 + 参数校验 → 生成 presigned PUT URL → 返回          │
│                                                             │
│  2. 前端 ← { uploadUrl, storageKey, fields }                │
│     直接 PUT 到 TOS 桶                                      │
│                                                             │
│  3. 前端 → POST /api/upload/callback                        │
│     携带 filename + metadata → 后端写入 DB                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 为什么这么改

| 改动                 | 收益                          |
| -------------------- | ----------------------------- |
| 文件不走后端         | 带宽省掉，服务器 CPU/内存省掉 |
| presigned URL 有时效 | 安全可控，过期作废            |
| 后端只写 DB          | 数据库写入轻量，失败可重试    |
| 前端可控             | 可加进度条、分片、暂停        |

## 细节设计

### 1. Token 接口

```
POST /api/upload/token
Body: { categoryId, description?, mimeType, filename? }
Return: { uploadUrl, storageKey, expiresIn, method, headers }
```

- **认证**：走现有的 `requireAuth()`
- **权限校验**：检查 category 可见性
- **安全**：生成带签名的 presigned URL，URL 本身包含鉴权信息，无需额外 token
- **防重放**：URL 有效期建议 15 分钟，过期需重新请求

### 2. 前端直传

```typescript
// 伪代码
const { uploadUrl, storageKey } = await fetchToken(...);
await fetch(uploadUrl, {
  method: 'PUT',
  body: file,
  headers: { 'Content-Type': file.type },
});
```

- 直接 PUT 到 TOS，支持进度监听
- 缩略图单独处理（见下文）
- 失败重试机制

### 3. Callback 接口

```
POST /api/upload/callback
Body: { storageKey, filename, originalName, mimeType, size, categoryId, description? }
```

- **幂等设计**：相同 storageKey 只写入一次
- **事务**：
  - 桶成功 + DB 成功 = 完成
  - 桶成功 + DB 失败 = 清理桶文件
  - 桶失败 = 不写 DB

### 4. 缩略图方案

这是最麻烦的一块。图片直传到桶，后端拿不到原图流，没法直接 Sharp。

两种思路：

**方案 A：对象存储回调（推荐）**

- TOS 设置回调：文件上传成功后，自动触发 Function Compute / Webhook
- FC 拉取原图 → Sharp 处理 → 写回缩略图路径
- 回调通知后端「处理完成」，后端再写 DB

**方案 B：前端预处理**

- 前端用 Canvas 或 browser-image-compression 压出缩略图
- 缩略图单独走一遍「token → PUT → callback」流程
- 后端写两条记录：原图 + 缩略图

考虑到维护成本，**推荐方案 A**。

## 新增文件

```
api/
  upload/
    token/route.ts      # 获取 presigned URL
    callback/route.ts   # 上传完成回调

hooks/
  useFileUpload.ts     # 封装上传逻辑

lib/
  upload.ts            # 复用部分 storage.ts 逻辑
```

## 前端 Hook 设计

```typescript
interface UseFileUploadOptions {
  categoryId: number;
  onSuccess?: (file: UploadedFile) => void;
  onError?: (error: Error) => void;
}

interface UploadProgress {
  stage: 'idle' | 'token' | 'upload' | 'callback' | 'done';
  percent: number;
}

function useFileUpload(options: UseFileUploadOptions) {
  // 获取 token
  // 执行直传
  // 轮询/等待 callback
  // 状态管理
}
```

拆分阶段的原因：让 UI 可以展示「当前在哪一步」。

## 当前代码实现

当前运行流程与上面的早期方案草图略有不同：

1. 已登录客户端向 `POST /api/upload/token` 请求上传凭证。服务端检查分类权限、MIME 类型和声明大小，生成不可由客户端指定的对象键，并创建短时 `UploadIntent`。
2. 客户端用凭证返回的 URL 和 `Content-Type` 直接向 TOS 执行 `PUT`，并通过 XHR 显示进度。
3. 客户端向 `POST /api/upload/complete` 提交 `intentId`。服务端验证所有者、权限、凭证有效期和 TOS 对象的大小/MIME；图片由服务端读取并生成 WebP 缩略图，再以数据库事务创建 Photo 并标记凭证完成。唯一关联约束支持安全重试。
4. 管理员可调用 `POST /api/upload/cleanup` 清除已过期且尚无 Photo 记录的意图及原图/缩略图对象。应由运维定期触发此端点；只有对象清理成功后才删除意图记录。

兼容的 `POST /api/upload` 仍保留原有服务端中转行为；云盘 `/api/files` 不使用此直传流程。部署时需先同步 `prisma/schema.prisma` 并生成 Prisma Client，再开放新流程。

## TOS 跨域配置

浏览器直传前，TOS bucket 必须配置 CORS：允许应用的实际 Origin（生产/预览环境按需逐项配置），允许 `PUT` 方法，并允许请求头 `Content-Type`。浏览器读取上传状态使用 XHR；响应头无需额外暴露给客户端。此仓库只记录要求，不会修改外部 bucket 配置。

## 兼容性

- **存量文件**：不受影响
- **新增文件**：走新流程
- **渐进切换**：可通过 flag 控制新/旧流程切换

## 写在最后

这套方案本质上是把「文件传输」从后端剥离，让后端回归「业务编排」角色。

直传不是银弹，它解决的是「文件流不该经过服务器」这个问题。真正的大文件场景（比如 1GB+），还得靠分片上传 + 断点续传——那是后话。

---

**参考提示词**：

```markdown
我想在 Next.js 项目中实现对象存储直传，方案如下：

- 后端生成 presigned PUT URL
- 前端直接 PUT 到 TOS 桶
- 上传完成后回调后端写入数据库

请你给我一个具体可落地的实现方案，包括：

1. 后端 presigned URL 生成代码示例
2. 前端直传完整流程
3. 回调接口设计
4. 错误处理和重试策略
```
