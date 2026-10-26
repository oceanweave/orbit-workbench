# 架构说明

## 当前技术栈

- **React + TypeScript + Vite**：负责页面、交互和构建。
- **Electron**：负责 macOS 桌面窗口、外部链接打开和应用打包。
- **localStorage**：当前用于保存看板、Kubeconfig、命令模板和主题偏好。
- **lucide-react**：提供统一的界面图标。

应用目前采用本地优先模型：Kubeconfig 内容只在用户主动选择、粘贴或编辑时读取并保存在本机，不会上传或执行；桌面端仅按用户操作写回指定文件。

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
| `orbit-kube-configs` | Kubeconfig 元数据、环境变量名称和当前编辑内容 |
| `orbit-kube-groups` | Kubeconfig 环境分组 |
| `orbit-kube-commands` | 内置和自定义命令模板 |
| `orbit-default-kube-command` | 默认命令模板 ID |
| `orbit-theme` | 亮色或暗色主题 |

应用启动时会对旧版本 Kubeconfig 数据做一次轻量迁移，为缺少的 `contexts`、`createdAt` 和 `envName` 字段补齐默认值。

书签分组采用扁平存储加可选 `parentId`：没有父分组的旧记录继续视为根目录，链接始终引用直属 `groupId`。`shared/bookmarks.mjs` 统一提供树遍历、祖先路径、子树筛选、整棵分组移动、删除保留策略及 Netscape HTML 递归导入导出。树遍历防止环和孤立引用导致分组不可见；修改上级时拒绝自身与后代。删除一个分组时，直属链接迁移到父级或可用分组，直接子分组提升一级，深层链接与目录保留。

`BookmarkGroupTree` 独立渲染目录、折叠状态、子树链接计数和拖拽悬停展开。页面筛选、批量移动、链接行的分组选择及搜索结果均展示完整路径；搜索结果新建看板时复制必要的祖先链，避免再次摊平。`tests/bookmarks.test.mjs` 使用纯模拟书签和 HTML5 DOM 解析器测试 24 层目录、空目录、同名分支、浏览器 HTML 两种 DL 排列形式、移动和删除后引用完整性。测试依赖 jsdom 不进入生产应用。

Kubeconfig 记录还包含用户可编辑的 `envName`（环境变量名称）、兼容旧版本的 `alias`/`metaName` 字段、来源类型和原始 YAML 文本。桌面版通过 `electron/preload.cjs` 暴露受限的文件选择、读取和写回 API；渲染层不会直接访问 Node.js 或 `ipcRenderer`。文件选择不按扩展名限制，兼容无后缀、`.yaml`、`.yml`、`.config`、`.conf` 和 `.txt` 等常见命名；写入路径支持 `~/`，由主进程展开到当前用户主目录。

导入由 `KubeImportPanel` 统一提供文件、目录、剪贴板入口。`shared/kubeconfig.mjs` 使用 YAML 解析器识别 Config、提取真实 Context 与对应集群、按路径去重并分配不冲突的环境变量名称；不执行 `users.exec`。`electron/kube-files.cjs` 提供可独立测试的只读文件读取、目录递归扫描与本地独占保存。单文件上限 2 MB，单次目录扫描上限 5,000 文件 / 32 MB 有效内容；不追踪符号链接，跳过 `.git` 和 `node_modules`，错误不包含原始 YAML。扫描结果先预览再勾选导入，写入本地工作区前检查存储容量。

剪贴板默认目录为 `app.getPath('userData')/kubeconfigs`，支持用户指定其他本地目录；保存前检查真实父目录的 `.git`（含 worktree 的 `.git` 文件与符号链接路径），拒绝在仓库内创建配置。使用 `wx` 独占创建，macOS/Linux 新文件权限为 `0600`。真实配置和工作区数据只在本机，构建包含代码、共享解析模块和生产依赖，测试样例只在系统临时目录动态生成。

## 命令生成规则

命令生成器只拼接文本，不执行 shell 命令。生成结果由以下部分组成：

```text
<ENV_NAME>=<kubeconfig.path>
KUBECONFIG=$<ENV_NAME> kubectl <template.command> [-n <namespace>] [--context <context>] [extraArgs]
```

每个配置有独立的环境变量名称，默认按配置名称生成全大写值，例如 `PRODUCTION`、`KIND`；命令生成时会把输入转换为合法的 shell 变量，路径中包含空格或特殊字符时会自动使用安全的单引号包裹。

这样既能复制完整命令，也能避免应用直接访问集群凭据。将来增加原生文件解析时，应继续保持“展示和复制默认安全，执行需要明确的独立入口”的边界。

## 桌面打包

`npm run build` 先运行 TypeScript 项目引用检查，再生成 `dist/`。Electron 主进程通过 `loadFile` 加载构建后的 `dist/index.html`，避免生产环境下资源路径失效。

- `npm run app:dir`：生成可直接运行的 macOS `.app` 目录。
- `npm run app:dmg`：生成 Apple Silicon arm64 DMG。
- `npm run app:win:dir`：生成 Windows x64 免安装目录，可用于启动 smoke test。
- `npm run app:win:nsis`：生成 Windows x64 NSIS 安装程序。
- `npm run app:win:zip`：生成 Windows x64 zip 便携包。

Windows 目标面向 Windows 10 和 Windows 11 x64。macOS 可以通过 Electron Builder 交叉打包；本机验证的是构建、安装包文件和免安装目录结构，`.github/workflows/windows.yml` 在 `windows-latest` 上执行 Windows 构建 smoke test。发布前仍应在实际 Windows 10/11 环境验证安装、启动、文件选择和 kubeconfig 写回。当前包未配置 Developer ID 签名、公证或 Windows 代码签名。

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
