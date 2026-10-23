# 架构说明

## 当前技术栈

- **React + TypeScript + Vite**：负责页面、交互和构建。
- **Electron**：负责 macOS 桌面窗口、外部链接打开和应用打包。
- **localStorage**：当前用于保存看板、Kubeconfig、命令模板、默认配置和主题偏好。
- **lucide-react**：提供统一的界面图标。

应用目前采用本地优先模型：Kubeconfig 文件内容不会被读取、上传或执行，应用只保存用户登记的路径、Context、集群地址和标签等元数据。

## 目录职责

```text
.
├── electron/
│   └── main.cjs          # Electron 主进程和外部链接处理
├── src/
│   ├── App.tsx           # 应用壳、页面状态和主要业务视图
│   ├── data.ts           # 首次运行的示例数据和内置命令
│   ├── main.tsx          # React 入口
│   ├── styles.css        # 全局主题、布局和组件样式
│   ├── types.ts          # 看板、链接、Kubeconfig 和命令模板类型
│   └── vite-env.d.ts     # Vite 类型声明
├── docs/
│   └── architecture.md   # 本文档
├── index.html             # Vite HTML 入口
├── package.json           # 脚本、依赖和 Electron Builder 配置
└── README.md              # 使用和开发入口
```

## 数据流

`App` 负责加载持久化状态，并根据当前导航渲染书签或 Kubeconfig 页面。页面组件通过受控 props 修改状态；状态变化后由 `usePersistentState` 写回 localStorage。

主要键名如下：

| 键名 | 内容 |
| --- | --- |
| `orbit-boards` | 书签看板、分组和链接 |
| `orbit-kube-configs` | Kubeconfig 元数据 |
| `orbit-kube-groups` | Kubeconfig 环境分组 |
| `orbit-kube-commands` | 内置和自定义命令模板 |
| `orbit-default-kube-config` | 默认 Kubeconfig ID |
| `orbit-default-kube-command` | 默认命令模板 ID |
| `orbit-theme` | 亮色或暗色主题 |

应用启动时会对旧版本 Kubeconfig 数据做一次轻量迁移，为缺少的 `contexts` 和 `createdAt` 字段补齐默认值。

## 命令生成规则

命令生成器只拼接文本，不执行 shell 命令。生成结果由以下部分组成：

```text
META=<kubeconfig.path>
KUBECONFIG=$META kubectl <template.command> [-n <namespace>] [--context <context>] [extraArgs]
```

这样既能复制完整命令，也能避免应用直接访问集群凭据。将来增加原生文件解析时，应继续保持“展示和复制默认安全，执行需要明确的独立入口”的边界。

## 桌面打包

`npm run build` 先运行 TypeScript 项目引用检查，再生成 `dist/`。Electron 主进程通过 `loadFile` 加载构建后的 `dist/index.html`，避免生产环境下资源路径失效。

- `npm run app:dir`：生成可直接运行的 macOS `.app` 目录。
- `npm run app:dmg`：生成 Apple Silicon arm64 DMG。

当前包未配置 Developer ID 签名和公证；发布给其他机器前需要补充签名、公证和 Windows 打包目标。

## 后续拆分建议

当功能继续增加时，优先按功能域拆分，而不是继续扩大 `App.tsx`：

```text
src/
├── features/
│   ├── bookmarks/         # 看板、导入导出、链接行
│   └── kubeconfig/        # 配置、分组、Context、命令生成器
├── components/            # Modal、按钮、徽章、表单等复用组件
├── hooks/                 # 持久化、主题和快捷键
└── lib/                   # 导入导出、命令拼接、数据迁移
```

这一步可以在接入原生文件存储前完成，以便 macOS 和 Windows 共用同一套领域模型。
