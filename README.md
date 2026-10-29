# Orbit Workbench

本地优先的链接看板、Kubeconfig 和命令管理工具。React + TypeScript + Electron，支持 macOS 和 Windows。

## 0.3.0：围绕分组，简化使用

- **移除标签管理**：不再提供标签添加、编辑、批量操作、筛选或标签搜索。旧标签字段保留在本地数据和 JSON 备份中，避免升级造成数据丢失。
- **统一工作台**：顶部切换模块，左侧目录可拖宽或收起，右侧专注当前内容。默认柔和灰绿亮色，保留暗色主题和原有主题偏好；取消大标题宣传区、统计卡片及重复工具栏。
- **链接看板**：看板用网格图标，内容分组使用列表树图标。紧凑链接行显示名称和域名，点击打开，双击弹窗修改名称、地址、分组与备注；展开查看完整地址和多行备注。复制、展开、更多操作各自独立，不触发跳转。
- **Kubeconfig**：配置直接放进左侧可折叠环境分组，右侧显示选中配置、来源路径、环境变量、所属分组和命令。无需在分组、配置列表和详情三栏之间来回寻找。
- **命令管理**：保留分组、拖拽、正文着色编辑及逐行/整段复制；搜索统一使用顶部搜索框，取消重复搜索入口。
- **低频管理收进菜单**：看板与分组支持双击编辑、右键或更多菜单。批量移动、删除、导出按需进入，不常驻一排按钮。

具体操作和验收范围见 [简洁工作台交互说明](docs/ui-workflows.md)。

## 常用操作

| 目的 | 操作 |
| --- | --- |
| 打开链接 | 单击链接正文；鼠标双击会优先进入编辑，不同时打开浏览器 |
| 修改链接 | 双击正文，或“更多 → 编辑链接” |
| 看完整地址、备注 | 点击链接行的展开箭头 |
| 新建看板 | 左侧“链接看板”旁的加号 |
| 新建/编辑分组 | 内容区“添加分组”；分组标题旁更多菜单；双击名称编辑 |
| 排序/移动 | 拖动手柄；插入线表示前后排序，分组中央高亮表示归组；支持多层目录及跨看板移动 |
| 批量链接操作 | 当前看板更多菜单 → 选择多个链接 |
| Kubeconfig 导入 | 左侧加号或“导入配置”，选择文件、目录递归扫描或剪贴板 |
| 配置查看与修改 | 双击配置，或右侧“查看配置”；正文默认只读，主动切换编辑后保存 |
| 配置批量操作 | 左侧底部配置管理菜单 → 选择多个配置 |
| 主题、设置、帮助 | 右上角应用选项菜单 |
| 导出、恢复、存储位置 | 看板底部管理菜单，或顶部“本机存储” |

## 数据与文件

- 数据在本机自动保存；不上传书签、kubeconfig 或命令，不执行用户保存的命令或 kubeconfig 认证插件。
- 书签 HTML 用于 Chrome / Edge / Firefox 等浏览器互通，保留多层目录。JSON 用于本工具的选择备份及恢复；完整工作区备份可能包含 kubeconfig 正文，默认仅选择书签。
- 配置导入按 YAML / JSON 内容识别，支持无后缀和 `.txt` 等任意文件名。目录可递归扫描，识别后勾选导入，重复路径跳过。单文件/目录导入引用原文件，剪贴板内容独占保存到本机目录，不覆盖已有文件。
- 写回配置时校验内容与外部变更，先创建备份再在原目录替换；失败保留编辑草稿。移除记录不删除原文件。
- 命令支持命名变量、仅本次、当前终端会话三种格式和 Bash/Zsh、PowerShell。Context/命名空间留空才表示配置默认，显式输入 `default` 仍生成参数。
- 顶部撤销用于整理、删除和导入等库操作，与命令正文的文本 Undo 分开；不撤销磁盘源文件写回。

## 开发与验证

需要 Node.js 22.12+、npm 10+。

```bash
npm ci
npm run dev
```

提交前：

```bash
npm run check
npm test
npm run build
git diff --check
```

测试使用隔离的 JSDOM、localStorage 和系统临时目录，只创建模拟配置，不读取个人书签、命令和真实 kubeconfig。系统级拖拽与跨平台安装需要单独验收，不能用合成拖拽事件代替。

## macOS 打包

```bash
npm run app:dir
npm run app:open
npm run app:dmg
```

本机开发包位于 `release/local-macos/`，使用完整 ad-hoc 签名，DMG 带 `-local` 后缀。它不具备 Apple 公证信任，不能冒充跨 Mac 正式分发包。

正式发布使用 `npm run app:release:mac`，生成 arm64 / x64 DMG，必须配置 Developer ID Application 证书与 Apple 公证凭据；缺少凭据或验收失败会终止发布。详见 [macOS 签名与分发](docs/macos-distribution.md)。未配置 Apple 凭据时不会生成正式公证包。

## Windows 打包

```bash
npm run app:win
```

生成 x64 NSIS EXE 与 ZIP，目标 Windows 10 / 11。CI 能验证构建、回归与归档内容，不等同已完成两套系统的实际安装、文件选择和原生拖拽测试。Windows 代码签名暂未配置。

配置 Apple 凭据后，`v*` tag 触发双平台发布；macOS 与 Windows 检查均成功后上传 DMG、EXE、ZIP 和 SHA256SUMS.txt。个人数据不纳入 Git、测试或安装包。可手动检查实际归档：

```bash
npm run package:audit -- "release/local-macos/mac-arm64/Orbit Workbench.app/Contents/Resources/app.asar"
```

## 代码和文档

- `src/App.tsx`：应用壳、持久化、全局搜索和数据交换。
- `src/features/bookmarks/`：看板工作流、紧凑链接和编辑弹窗。
- `src/features/kube/`：配置工作流、原文详情和常用命令模板管理。
- `src/features/commands/`：独立命令库及 CodeMirror 编辑器。
- `src/components/`：目录树、分组面板、导入、菜单、弹窗和共用控件。
- `src/workspace-simple.css`：统一色彩与简洁工作台布局；`shared/` 存放可测试的数据规则；`electron/` 存放受限本机文件接口。
- [架构说明](docs/architecture.md) · [交互说明](docs/ui-workflows.md) · [贡献指南](CONTRIBUTING.md) · [版本记录](CHANGELOG.md)

仓库：[oceanweave/orbit-workbench](https://github.com/oceanweave/orbit-workbench)。多存储空间、同步与 SSH 不在当前版本范围内。
