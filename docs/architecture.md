# 架构说明

## 当前技术栈

- **React + TypeScript + Vite**：负责页面、交互和构建。
- **Electron**：负责 macOS / Windows 桌面窗口、外部链接打开和应用打包。
- **localStorage**：当前用于保存看板、Kubeconfig、命令模板和主题偏好。
- **lucide-react**：提供统一的界面图标。
- **Prism**：对独立命令库的代码进行本地语法分词；提供八种语言模式，不请求外部服务。

应用目前采用本地优先模型：Kubeconfig 内容只在用户主动选择、粘贴或编辑时读取并保存在本机，不会上传或执行；桌面端仅按用户操作写回指定文件。

## 目录职责

```text
.
├── electron/
│   └── main.cjs          # Electron 主进程和外部链接处理
├── src/
│   ├── App.tsx           # 应用壳、页面状态和主要业务视图
│   ├── features/commands/ # 独立命令库、编辑器、代码行渲染、持久化和主题样式
│   ├── components/Modal.tsx # 共用弹窗，忽略输入法组合中的 Escape
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

## 工作流模块（0.2.0）

- `src/lib/workspaceStore.ts`：先提交存储再发布状态；按键通知订阅者，同一手势内多次更新合为一次库 Undo。撤销仅恢复记录，不能撤销源文件写回。读取失败不在挂载阶段覆盖存储。
- `shared/kube-command.mjs`：独立纯生成器，三种复制格式、Bash/Zsh 与 PowerShell 转义；空字符串才是默认参数哨兵，真实 `default` 按显式参数输出。模板与附加参数是用户书写的 Shell 文本。
- `shared/workspace.mjs`：版本校验、引用/循环校验、选择集合投影、复制 ID 重映射、子树独立和备份合并。
- `ExchangePanel`：无副作用预览；勾选叶子时保留必要祖先；HTML 互通与 JSON 恢复用途分开。JSON v1 向后兼容，v2 加入范围、分类和收展状态；合并分配新 ID，配置按路径去重；替换仅更新文件包含的范围；先将该范围保存为 `orbit-recovery-backup` 并发起 JSON 下载，备份写入失败则终止恢复。本机存储入口可再次预览并恢复该副本。
- `BoardOrganizer` / `GroupOrganizer` / `BookmarkPanels`：看板分类、批量管理及内容分组面板；`BookmarkGroupTree` 继续负责目录层级。分类是看板外层，不复用内容分组的 parentId。
- `DirectorySizer`：各工具独立保存目录宽度/收起状态；拖宽期间只调整 CSS，放开才保存，避免每个 pointermove 写库。
- `InlineCommandEditor`：CodeMirror 6 处理光标、选区、历史及语言颜色。原始文本与归一化文档位置映射，局部修改不重写未涉及的 CRLF/CR/LF、Tab 和空白；复制使用原始字符串。450ms 防抖、IME 结束后保存；失败草稿保留在当前会话，导出前刷新待保存内容，退出前提示。
- `ColorPicker` / `ContextMenu` / `DropGap` / `StoragePanel`：统一预设与自选颜色、键盘可用的右键菜单、真实空白落点、真实存储位置入口。

顶部工具页面首次加载后保持挂载，切换使用 hidden，保存目录/选择/滚动与草稿；命令模块首次进入时才延迟加载。隐藏页面的 Modal 不响应 Escape。

## 数据流

表单布局集中在 `src/components/form-layout.css`，由入口在基础样式后加载。弹窗字段使用 18px 标签行高、8px 标签间距、42px 控件高度；目录输入与按钮共用同一个控件行，控件自身不再携带顶部外边距。命令生成器使用同一原则和 40px 控件高度。导入方式导航及操作栏保留在滚动区域边缘，剪贴板编辑器用 `focus({ preventScroll: true })` 聚焦，避免切换来源时意外滚走导航。

`App` 负责加载持久化状态，并根据当前导航渲染书签或 Kubeconfig 页面。页面组件通过受控 props 修改状态；`usePersistentState` 同步保存成功才发布状态，失败不虚报成功。

主要键名如下：

| 键名 | 内容 |
| --- | --- |
| `orbit-board-categories` | 看板外层分类，旧看板无 categoryId 时位于未分类 |
| `orbit-bookmark-collapse` / `orbit-tree-collapse` / `orbit-expanded-boards` | 内容面板与目录收展偏好 |
| `orbit-boards` | 书签看板、分组和链接 |
| `orbit-kube-configs` | Kubeconfig 元数据、环境变量名称和当前编辑内容 |
| `orbit-kube-groups` | Kubeconfig 环境分组 |
| `orbit-kube-commands` | 内置和自定义命令模板 |
| `orbit-default-kube-command` | 默认命令模板 ID |
| `orbit-command-library` | 独立命令库（版本、分组及多行记录），与 kubectl 模板分离 |
| `orbit-theme` | 亮色或暗色主题 |
| `orbit-kube-sort` | 配置的手动、名称或创建时间排序偏好 |

应用启动时会对旧版本 Kubeconfig 数据做一次轻量迁移，为缺少的 `contexts`、`createdAt` 和 `envName` 字段补齐默认值。

命令库按功能域独立放在 `src/features/commands/`，页面、样式及语法分词模块仅在进入命令页时延迟加载，避免增加书签和 kubeconfig 首屏的解析开销。`CommandLibraryView` 管理分组、筛选、多选和拖放；`CommandEditor` 使用独立草稿，保存成功后才关闭；`CommandCode` 使用 Prism 分词后递归拆分逻辑行，用 React 文本节点渲染，避免 HTML 注入和多行字符串样式丢失。复制从原始 `content` 读取，不从带行号的 DOM 提取；单行保留缩进，整段保留原始换行，多个记录用两个换行分隔。代码块允许换行和内部滚动，长列表每次增加 20 条，分词结果按内容和语言缓存。

`shared/commands.mjs` 提供可测试的筛选、复制文本组合、排序、批量移动和分组删除规则。空 `groupId` 表示固定的「未分组」；删除分组保留所有命令内容。记录和分组的数组顺序即手动排序，拖拽复用 `useWorkspaceDrag` 的小型浮层与插入线。`useCommandLibrary` 在更新 UI 前同步提交本地存储，配额或权限失败时返回失败并保留草稿；演示记录只有无凭据的命令文本。工作区 JSON 备份包含命令库和 kubectl 模板。

`tests/commands.test.mjs` 和 `tests/commands-ui.test.mjs` 使用模拟内容与隔离存储，覆盖换行/缩进、八种语言分词文本完整性、逐行和整体复制、CRUD、输入法确认、拖放排序及归类、批量操作、删除分组保留内容、存储满时保留编辑及重载持久化。不读取或运行真实用户命令。

书签分组采用扁平存储加可选 `parentId`：没有父分组的旧记录继续视为根目录，链接始终引用直属 `groupId`。`shared/bookmarks.mjs` 统一提供树遍历、祖先路径、子树筛选、整棵分组移动、删除保留策略及 Netscape HTML 递归导入导出。树遍历防止环和孤立引用导致分组不可见；修改上级时拒绝自身与后代。删除一个分组时，直属链接迁移到父级或可用分组，直接子分组提升一级，深层链接与目录保留。

`BookmarkGroupTree` 独立渲染目录、折叠状态、子树链接计数和拖拽悬停展开。页面筛选、批量移动、链接行的分组选择及搜索结果均展示完整路径；搜索结果新建看板时复制必要的祖先链，避免再次摊平。`tests/bookmarks.test.mjs` 使用纯模拟书签和 HTML5 DOM 解析器测试 24 层目录、空目录、同名分支、浏览器 HTML 两种 DL 排列形式、移动和删除后引用完整性。测试依赖 jsdom 不进入生产应用。

目录树以看板行为零级，每层使用统一的 18px 左边距和固定的展开按钮占位；文件夹图标和名称使用相同的列间距，叶子节点也保留占位。连接线按祖先分支与最后一个同级节点绘制，不参与点击和拖放命中。缩进不截断深度，深层行保留最小内容宽度并在侧栏内部横向滚动；拖拽插入线沿当前行起始位置绘制，避免重复叠加缩进。

手动排序使用数组顺序持久化，避免另存不一致的序号。`shared/ordering.mjs` 提供不修改原数据的前后插入、可见顺序固化及命中区域判断；`placeBookmarkGroup` 以整棵子树为单位更新父级、顺序、跨看板链接归属，保留原 ID，拒绝循环与无效目标。`placeBookmarkLink` 将排序及目标分组更新合为一次状态变更。分组上下各四分之一区域插入同级，中间一半移入；拖到看板标题表示根目录，链接则进入根“未分组”。

`src/hooks/useWorkspaceDrag.ts` 统一拖拽载荷、轻量预览、命中反馈、嵌套列表边缘滚动、清理和拖动结束的点击抑制。拖动不经过文本输入控件；提示放在列表之后避免目标几何位置跳动。Kubeconfig 自动排序视图第一次拖动时先固化当前可见顺序，再执行手动插入，隐藏行之间的顺序保持不变。`tests/drag-ui.test.mjs` 在隔离的 jsdom 工作区渲染实际 App，验证真实 React 拖拽事件路由与状态持久化；模拟配置和书签不读取用户数据。

Kubeconfig 记录还包含用户可编辑的 `envName`（环境变量名称）、兼容旧版本的 `alias`/`metaName` 字段、来源类型和原始 YAML 文本。桌面版通过 `electron/preload.cjs` 暴露受限的文件选择、读取和写回 API；渲染层不会直接访问 Node.js 或 `ipcRenderer`。文件选择不按扩展名限制，兼容无后缀、`.yaml`、`.yml`、`.config`、`.conf` 和 `.txt` 等常见命名；写入路径支持 `~/`，由主进程展开到当前用户主目录。

导入由 `KubeImportPanel` 统一提供文件、目录、剪贴板入口。`shared/kubeconfig.mjs` 使用 YAML 解析器识别 Config、提取真实 Context 与对应集群、按路径去重并分配不冲突的环境变量名称；不执行 `users.exec`。`electron/kube-files.cjs` 提供可独立测试的只读文件读取、目录递归扫描与本地独占保存。单文件上限 2 MB，单次目录扫描上限 5,000 文件 / 32 MB 有效内容；不追踪符号链接，跳过 `.git` 和 `node_modules`，错误不包含原始 YAML。扫描结果先预览再勾选导入，写入本地工作区前检查存储容量。

剪贴板默认目录为 `app.getPath('userData')/kubeconfigs`，支持用户指定其他本地目录；保存前检查真实父目录的 `.git`（含 worktree 的 `.git` 文件与符号链接路径），拒绝在仓库内创建配置。使用 `wx` 独占创建，macOS/Linux 新文件权限为 `0600`。真实配置和工作区数据只在本机，构建包含代码、共享解析模块和生产依赖，测试样例只在系统临时目录动态生成。

## 命令生成与源文件写回

`shared/kube-command.mjs` 的输入明确包含 format、shell、context、namespace；输出包含完整预览、变量定义及原始路径。空 Context/Namespace 不加参数，显式 default 仍加参数。Bash/Zsh 路径中的 `~/` 转换成双引号内的 `$HOME`，其余值按单引号规则转义；PowerShell 使用自己的字面量规则，单次格式在 finally 中恢复原 KUBECONFIG。命名变量格式在 PowerShell 中用 `kubectl --kubeconfig $NAME`，不改变后续终端环境。应用永不执行这些命令。

`ConfigDetailModal` 的 onSave 返回 Promise<boolean>，等待写回和元数据保存后关闭。详情默认只读正文，主动切换编辑后才可修改 YAML / 文件 current-context。命令区 Context 选择仅影响生成文本，不重写文件。

主进程 `writeKubeFile` 先验证内容，比较读取时的原文，检测失效/不可写/外部变更；创建权限受限的备份，在原目录完成临时文件写入与 rename，避免半写入及相对证书引用目录变化。外部程序恰在最后一次比较与 rename 之间并发修改仍存在系统级竞态，当前没有跨进程文件锁；备份保留在源文件旁供恢复。移除配置记录不删除源文件。

## 验证边界

`npm test` 使用隔离 localStorage、JSDOM 和系统临时目录；不读取真实 kubeconfig、个人书签或执行用户命令。真实 Bash 回归只调用模拟 kubectl 函数；Windows runner 有 Git Bash 时执行同一测试。PowerShell 生成文本有断言，不等同 PowerShell 原生执行验收。

当前覆盖默认参数、特殊字符转义、失败草稿、无后缀/.txt/递归导入、原文件变化检测与备份、选择集合/祖先/复制 ID、JSON 版本和循环引用、Undo、模块切换草稿、CodeMirror 换行与 IME 自动保存。浏览器人工验证了导航、正文输入/复制/编辑 Undo。系统指针拖放、macOS 原生窗口和 Windows 10/11 安装运行仍需各自验收；不能用合成 dataTransfer 测试替代。

多命名存储空间为后续增强，本次没有实现跨库写入、离线库或实时同步。

## 桌面打包

`npm run build` 先运行 TypeScript 项目引用检查，再生成 `dist/`。Electron 主进程通过 `loadFile` 加载构建后的 `dist/index.html`，避免生产环境下资源路径失效。

- `npm run app:dir`：生成完整 ad-hoc 签名的本机 macOS `.app` 目录。
- `npm run app:dmg`：生成 Apple Silicon arm64 本地开发 DMG，产物在 `release/local-macos/` 并带 `-local` 后缀。
- `npm run app:release:mac`：正式签名、公证并验证 arm64/x64 DMG；缺少 Developer ID 或 Apple 凭据时失败，不产生可发布替代品。
- `npm run app:win:dir`：生成 Windows x64 免安装目录，可用于启动 smoke test。
- `npm run app:win:nsis`：生成 Windows x64 NSIS 安装程序。
- `npm run app:win:zip`：生成 Windows x64 zip 便携包。

Windows 目标面向 Windows 10 和 Windows 11 x64。macOS 可以通过 Electron Builder 交叉打包；本机验证的是构建、安装包文件和免安装目录结构，`.github/workflows/windows.yml` 在 `windows-latest` 上执行 Windows 构建 smoke test。发布前仍应在实际 Windows 10/11 环境验证安装、启动、文件选择和 kubeconfig 写回。Windows 代码签名尚未配置。macOS 正式发布已接入强制签名、公证、Gatekeeper 及挂载检查，但须配置 Apple 凭据后才能实际运行；本地 ad-hoc 构建不代表跨机信任通过。详见 [macOS 签名与分发](macos-distribution.md)。

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
