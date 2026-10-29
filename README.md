# Orbit Workbench

Orbit Workbench 是一个本地优先的书签、kubeconfig 和常用命令管理工作台。使用 React + TypeScript + Vite 构建界面，通过 Electron 打包 macOS / Windows 桌面应用。

## 命令管理

顶部的「命令管理」提供独立的命令记录库，与 kubeconfig 的 kubectl 模板分开保存：

- 新增、编辑、复制副本和删除多行命令，支持备注、分组与语言选择。
- Shell/Bash、PowerShell、SQL、Python、JavaScript、JSON、YAML 和纯文本；代码块提供行号、语法配色、浅色注释及亮暗主题适配。
- 每行左侧可复制原始行；顶部复制整段，多选后复制选中记录，「复制当前列表」复制当前筛选结果。复制不包含行号或提示符，保留注释、缩进和空行；逐行复制按物理行处理，跨行续写命令请复制整段。
- 分组可重命名、调色和排序；拖动命令右侧手柄可排序或移入左侧分组，悬停目标明确高亮；也可直接通过记录上的分组菜单移动。
- 多选记录可批量复制、移动、删除；删除分组会保留记录到「未分组」。支持名称、内容、备注和语言筛选，顶部搜索在命令页搜索所有命令分组。
- 正文直接编辑并着色，450ms 防抖保存，`⌘ / Ctrl + S` 手动保存；编辑器支持选中文字/当前行复制，保留 CRLF、Tab、空行及末尾换行。名称与备注编辑表单支持 `⌘ / Ctrl + Enter` 保存，中文输入法候选确认不会误提交；保存失败时保留编辑内容。每条上限 100,000 字符，列表分批展示，避免大量代码同时高亮。

记录只保存在本机，不执行命令。工作区 JSON 备份包含命令库；个人命令、书签和 kubeconfig 不会随源代码或安装包发布。

交互设计参考 [pet](https://github.com/knqyf263/pet) 的命令片段记录与 [massCode](https://masscode.io/documentation/code/) 的分组代码库布局，正文编辑使用 [CodeMirror 6](https://codemirror.net/)，弹窗预览使用 [Prism](https://prismjs.com/)。

## 快速开始

```bash
npm install
npm run dev
```

打开终端输出的本地地址即可使用。应用数据保存在当前浏览器或 Electron 用户目录的 `localStorage` 中。

CI 和需要严格复现依赖的环境使用 `npm ci`。

代码仓库：<https://github.com/oceanweave/orbit-workbench>

生产构建：

```bash
npm run build
```

## macOS 应用

当前仓库包含 Electron 打包配置，Apple Silicon Mac 可以生成并安装本地 `.app`：

```bash
npm run app:dir
open "release/mac-arm64/Orbit Workbench.app"
```

也可以生成 DMG：

```bash
npm run app:dmg
```

本地包使用 arm64 架构，暂未配置 Developer ID 签名。第一次在其他 Mac 上打开时，系统可能需要在 Finder 中右键应用并选择“打开”。

## Windows 应用

Windows 版本使用 Electron Builder 生成 x64 安装包，目标是 Windows 10 及 Windows 11。Windows x64 安装包可以在两套系统上使用；构建产物不包含真实 kubeconfig，也不会在构建阶段执行集群命令。

```bash
# 生成 NSIS 安装程序（推荐分发）
npm run app:win:nsis

# 生成免安装目录，用于 smoke test
npm run app:win:dir

# 生成 zip 便携包
npm run app:win:zip
```

产物位于 `release/`，文件名类似 `Orbit-Workbench-${version}-x64.exe` 和 `Orbit-Workbench-${version}-x64.zip`。macOS 可以交叉构建这些产物；本机只验证了打包和文件结构，未在 Windows 10/11 虚拟机或实体机上运行安装器。提交发布前应在 `windows-latest` CI 或实际 Windows 10/11 环境执行安装、启动、文件选择和 kubeconfig 写回 smoke test。

推送 `v*` tag 后，`.github/workflows/release.yml` 会在 macOS 和 Windows runner 上分别构建，并自动创建 GitHub Release 上传 DMG、NSIS EXE 和 ZIP 资产。发布构建统一使用 Node.js 22，以满足当前 Electron 打包依赖的运行时要求；electron-builder 只负责生成文件，Release job 负责上传。

## 0.2.0 工作流优化

- 顶部切换工具；各工具保留目录、选择和会话草稿。左侧目录可拖宽、键盘调整或收起，不再占用一列常驻主导航。
- 看板外层分类与多层分组分开：分类增删改、颜色、排序及拖入；「整理看板」支持分类迁移、多选、复制、删除和选择导出。旧看板自动位于未分类，原 ID 不变。
- 内容默认按可折叠分组面板展示，也可切回平铺。收展状态保存在本机；搜索临时展开匹配路径。分组可编辑颜色/备注、管理子树、批量移动/删除（保留内容），也可将完整子树复制或移动为新看板。
- 看板/分组名称可双击打开编辑，右键提供相关操作。链接名称点击打开，铅笔或右键名称进入就地编辑，备注保持直接编辑；打开区域与管理按钮分开。
- 目录首末与条目间增加真实空白放置区。排序插入线与中央归组高亮分开，多选链接/配置/命令可整体拖入分组。悬停展开是临时状态，取消拖动不改保存的收展设置。
- 「备份 JSON」打开范围选择，默认仅书签；完整工作区明确提示包含 kubeconfig 正文。HTML/JSON 导入先预览树与数量、勾选集合，再提交；支持必要祖先保留、URL 去重、版本/引用校验、合并和替换恢复。替换前保存本机恢复副本并下载备份，可从「本机存储」恢复上一次替换前的数据。
- 顶部「撤销库操作」恢复最近的记录整理、移动、删除或导入；与代码编辑器的文本 Undo 独立。撤销历史仅保留本次应用会话，最多 30 次并有内存限制；不会撤销磁盘源文件写回。
- kubeconfig 支持命名变量、单次命令、当前终端会话三种复制格式及 Bash/Zsh、PowerShell 选择。Context/Namespace 留空才表示使用配置默认；显式 `default` 仍输出参数。路径和参数按 Shell 转义，环境变量禁止系统保留名与重复名。
- 配置详情区分查看和编辑。保存等待源文件写回结果，失败保留草稿；写回先验证 YAML 和源文件变化，再备份、写临时文件并同目录替换。相对证书路径所在目录不变。详情可复制正文、定位源文件。
- 点击顶部「本机存储」查看真实 Electron userData 路径、复制或打开目录、备份和恢复。浏览器模式明确说明使用站点存储。

多存储空间仍是后续增强，不等同当前已实现的多用户同步。macOS 原生窗口、Windows 10/11 安装与真实指针拖拽需分别验收；JSDOM 事件回归不代表系统级拖拽验收通过。

## 已实现

- 书签看板：看板、分组、标签、搜索、紧凑链接行、打开链接、复制链接、删除链接；名称、网址和备注支持行内编辑。
- 全局搜索：顶部搜索框按 Enter 后搜索所有看板与 kubeconfig，结果页可筛选类型、批量选择，并将书签复制/移动到新看板或 kubeconfig 复制/移动到新分组；复制保留原数据，移动会更新原归属。
- 组织能力：分组可继续嵌套子分组，左侧目录树逐层展开/收起，父分组计数和筛选包含全部子分组；通过完整路径选择分组，支持新建子分组、重命名和调整上级目录。链接可拖放到任意层级，悬停折叠目录会展开；删除分组时保留链接，子分组提升一级。标签筛选支持多选并按全部匹配，额外标签以 `+N` 汇总。
- 拖拽整理：看板上下排序；分组上/下边缘显示插入线，用于调整同级顺序，中央高亮表示移入该分组成为子分组。分组拖到看板标题可提升到根目录或跨看板移动，所有子分组与链接一起保留，并阻止移入自身/后代。链接可拖到其他链接前后排序并采用目标分组，拖到看板标题时进入根目录“未分组”。排序与层级自动在本机保存；输入框保持文本编辑，右侧手柄可明确发起拖动。
- 浏览器书签导入导出：支持 Netscape Bookmark HTML，顶层文件夹映射为看板，其余文件夹完整保留父子层级、空目录及同名分支。历史平铺数据继续兼容；已经被旧版摊平的目录无法推断原父子关系，需重新导入原始 HTML 恢复层级。
- 看板导出：`导出当前` 和 `导出全部` 生成 Netscape Bookmark HTML，可直接导入 Chrome、Edge、Firefox 等浏览器；`备份 JSON` 可选择仅书签、仅命令或完整工作区，并通过导入入口恢复。
- Kubeconfig：配置文件路径、环境分组、标签、Context 选择、详情编辑和拖拽归类；详情页可查看和修改原始 YAML，并在桌面版写回源文件。
- Kubeconfig 分组与配置支持拖拽排序，配置可拖入其他环境分组。提供手动、名称、创建时间三种排序；从自动排序视图拖动配置后按当前可见顺序切换为手动排序，并保存偏好。
- Kubeconfig 导入：提供单个文件、目录递归扫描、剪贴板三个入口。不按后缀筛选，按 YAML / JSON 内容识别；目录扫描后可勾选配置并批量导入到指定分组，重复路径自动跳过。Context、集群地址、文件名及环境变量名称自动生成，仍可调整名称和标签。文件与目录导入只读取原文件。
- 剪贴板内容默认保存到应用本地数据目录下的 `kubeconfigs/`，可选择仓库以外的其他目录；文件权限为 `0600`（macOS/Linux），同名文件不会被覆盖。不会上传配置或执行其中的认证插件。浏览器模式导入文件需补充完整本机路径；剪贴板保存文件需要桌面版。
- 命令生成器：点击任意 kubeconfig 后选择 Context、命令模板、命名空间和附加参数，实时生成并复制；支持环境变量名称、自定义命令和默认命令：

  ```bash
  PRODUCTION="$HOME/.kube/prod.config"
  KUBECONFIG="$PRODUCTION" kubectl get pods -o wide -n 'dev'
  ```

- 常用命令模板：Pod、Node、Service、Deployment、rollout、describe、logs、资源排行和按创建时间排序等，并支持自定义命令。
- 批量管理：书签条目和 kubeconfig 都支持选择、批量移动、批量删除和批量标签操作（追加、移除、替换）；单条标签点击即可编辑，管理反馈会显示在触发操作的指针附近。
- 本地持久化：数据保存到浏览器 `localStorage`，不上传 kubeconfig 内容。
- 界面主题与密度：支持暗色 / 亮色主题以及舒适 / 紧凑信息密度，选择会自动保存到本机；筛选栏提供清除筛选入口。
- 响应式布局：桌面、窄桌面和移动宽度均有布局切换。
- 桌面发布：Electron macOS arm64 `.app`/DMG，以及 Windows x64 NSIS 安装程序和 zip 便携包。

## 项目结构和协作

核心代码集中在 `src/`，Electron 主进程位于 `electron/`。Kubeconfig 导入界面位于 `src/components/KubeImportPanel.tsx`，跨端解析和去重位于 `shared/kubeconfig.mjs`，本地目录遍历和文件保存位于 `electron/kube-files.cjs`。`npm test` 在系统临时目录创建纯模拟文件，覆盖无后缀、`.txt`、多层目录、重复识别、权限和仓库隔离；测试结束后清理临时目录，真实配置不进入仓库。

- [架构说明](docs/architecture.md)：数据流、持久化键、命令生成和桌面打包边界。
- [贡献指南](CONTRIBUTING.md)：开发、验证、提交和发布流程。
- [版本记录](CHANGELOG.md)：当前版本能力和已知限制。

提交前运行：

```bash
npm run check
npm run build
git diff --check
```

## 后续增强

1. 多存储目录、只读/离线库与跨库复制；先验证备份、来源隔离和失败恢复，再开放迁移。
2. macOS Keychain / Windows Credential Manager 与证书有效期状态。
3. 针对 macOS、Windows 10 和 Windows 11 的真实安装、指针拖拽、文件权限和系统文件选择回归。

## 发布与本地数据隔离

`v*` tag 触发 GitHub Actions 生成 DMG、Windows EXE 和 ZIP，再发布到 GitHub Release。发布前会运行全部测试并对实际 `app.asar` 检查：只允许构建资源、应用模块及安装依赖，检测到本地导入文件或浏览器存储则终止发布。可手动执行：

```bash
npm run package:audit -- "release/mac-arm64/Orbit Workbench.app/Contents/Resources/app.asar"
```

用户的 kubeconfig、书签、命令记录及备份只保留在本机，不纳入 Git 或安装包；代码中的公开链接和无凭据配置仅用于演示和测试。源码与模拟测试可以上传，真实数据不要放入项目目录。
