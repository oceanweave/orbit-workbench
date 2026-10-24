# Orbit Workbench

Orbit Workbench 是一个本地优先的书签看板与 kubeconfig 管理工作台。当前版本用 React + TypeScript + Vite 实现，适合先验证交互和数据模型，后续可以直接接入 Tauri 生成 macOS / Windows 桌面应用，也可以将同一套模型迁移到 SwiftUI 的 Apple 客户端。

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

推送 `v*` tag 后，`.github/workflows/release.yml` 会在 macOS 和 Windows runner 上分别构建，并自动创建 GitHub Release 上传 DMG、NSIS EXE 和 ZIP 资产。发布构建统一使用 Node.js 22，以满足当前 Electron 打包依赖的运行时要求。

## 已实现

- 书签看板：看板、分组、标签、搜索、紧凑链接行、打开链接、复制链接、删除链接；名称、网址和备注支持行内编辑。
- 全局搜索：顶部搜索框按 Enter 后搜索所有看板与 kubeconfig，结果页可筛选类型、批量选择，并将书签复制/移动到新看板或 kubeconfig 复制/移动到新分组；复制保留原数据，移动会更新原归属。
- 组织能力：看板和分组树、链接拖拽到分组、分组计数、标签筛选；标签筛选支持多选并按全部匹配，条目标签过多时以 `+N` 汇总；支持看板/分组重命名与删除、删除分组时自动迁移链接。
- 浏览器书签导入：支持 Netscape Bookmark HTML，顶层文件夹映射为看板，嵌套文件夹映射为分组。
- 看板导出：`导出当前` 和 `导出全部` 生成 Netscape Bookmark HTML，可直接导入 Chrome、Edge、Firefox 等浏览器；`备份 JSON` 用于保留 Orbit Workbench 的完整本地数据。
- Kubeconfig：配置文件路径、环境分组、标签、Context 选择、详情编辑和拖拽归类；详情页可查看和修改原始 YAML，并在桌面版写回源文件。
- Kubeconfig 导入：支持选择任意文本文件（包括无后缀、`.yaml`、`.yml`、`.config`、`.conf`、`.txt`），也支持选择保存目录后从剪贴板或文本框创建配置；每个配置有独立、可自定义的环境变量名称，命令会自动生成对应的 shell 环境变量。
- 命令生成器：点击任意 kubeconfig 后选择 Context、命令模板、命名空间和附加参数，实时生成并复制；支持环境变量名称、自定义命令和默认命令：

  ```bash
  PRODUCTION=~/.kube/prod.config
  KUBECONFIG=$PRODUCTION kubectl get pods -o wide -n dev
  ```

- 常用命令模板：Pod、Node、Service、Deployment、rollout、describe、logs、资源排行和按创建时间排序等，并支持自定义命令。
- 批量管理：书签条目和 kubeconfig 都支持选择、批量移动、批量删除和批量标签操作（追加、移除、替换）；单条标签点击即可编辑，管理反馈会显示在触发操作的指针附近。
- 本地持久化：数据保存到浏览器 `localStorage`，不上传 kubeconfig 内容。
- 界面主题与密度：支持暗色 / 亮色主题以及舒适 / 紧凑信息密度，选择会自动保存到本机；筛选栏提供清除筛选入口。
- 响应式布局：桌面、窄桌面和移动宽度均有布局切换。
- 桌面发布：Electron macOS arm64 `.app`/DMG，以及 Windows x64 NSIS 安装程序和 zip 便携包。

## 项目结构和协作

核心代码集中在 `src/`，Electron 主进程位于 `electron/`。数据模型和内置示例数据分别维护在 `src/types.ts` 与 `src/data.ts`；页面状态、导入导出和命令生成逻辑目前集中在 `src/App.tsx`，后续按功能域增长时再拆分为 `src/features/`、`src/components/` 和 `src/lib/`。

- [架构说明](docs/architecture.md)：数据流、持久化键、命令生成和桌面打包边界。
- [贡献指南](CONTRIBUTING.md)：开发、验证、提交和发布流程。
- [版本记录](CHANGELOG.md)：当前版本能力和已知限制。

提交前运行：

```bash
npm run check
npm run build
git diff --check
```

## 下一步建议

1. 接 Tauri 2：把 `localStorage` 替换为 SQLite / JSON 文件，接入系统文件选择器和原生菜单。
2. 增加安全存储：macOS Keychain、Windows Credential Manager，用于保存敏感元数据。
3. 增加 kubeconfig 文件解析：读取 context、server、namespace，支持文件存在性和证书过期提示。
4. 增加 HTML / JSON 双向导入导出与冲突合并。
5. Apple 端优先做 iPad 分栏布局，再复用数据模型扩展 iPhone 快捷入口和 iCloud 同步。

