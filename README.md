# Orbit Workbench

Orbit Workbench 是一个本地优先的书签看板与 kubeconfig 管理工作台。当前版本用 React + TypeScript + Vite 实现，适合先验证交互和数据模型，后续可以直接接入 Tauri 生成 macOS / Windows 桌面应用，也可以将同一套模型迁移到 SwiftUI 的 Apple 客户端。

## 运行

```bash
npm install
npm run dev
```

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

## 已实现

- 书签看板：看板、分组、标签、搜索、链接卡片、打开链接、复制链接、删除链接。
- 组织能力：看板和分组树、链接拖拽到分组、分组计数、标签筛选。
- 浏览器书签导入：支持 Netscape Bookmark HTML，顶层文件夹映射为看板，嵌套文件夹映射为分组。
- 看板导出：当前看板导出为 `.orbit.json`，适合备份和迁移。
- Kubeconfig：配置文件路径、环境分组、标签、Context 选择、详情编辑和拖拽归类。
- 命令生成器：选择默认 kubeconfig、Context、命令模板、命名空间和附加参数，实时生成并复制；支持自定义命令和默认命令：

  ```bash
  META=~/.kube/prod.config
  KUBECONFIG=$META kubectl get pods -o wide -n dev
  ```

- 常用命令模板：Pod、Node、Service、Deployment、rollout、describe、logs、资源排行和按创建时间排序等，并支持自定义命令。
- 本地持久化：数据保存到浏览器 `localStorage`，不上传 kubeconfig 内容。
- 界面主题：支持暗色 / 亮色主题切换，主题选择会自动保存到本机。
- 响应式布局：桌面、窄桌面和移动宽度均有布局切换。

## 下一步建议

1. 接 Tauri 2：把 `localStorage` 替换为 SQLite / JSON 文件，接入系统文件选择器和原生菜单。
2. 增加安全存储：macOS Keychain、Windows Credential Manager，用于保存敏感元数据。
3. 增加 kubeconfig 文件解析：读取 context、server、namespace，支持文件存在性和证书过期提示。
4. 增加 HTML / JSON 双向导入导出与冲突合并。
5. Apple 端优先做 iPad 分栏布局，再复用数据模型扩展 iPhone 快捷入口和 iCloud 同步。

