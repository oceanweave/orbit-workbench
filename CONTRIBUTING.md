# 贡献指南

## 开发环境

- Node.js 22.12 或更高版本
- macOS 本地打包需要 Apple Silicon 环境；Windows 打包可在后续补充对应目标

首次运行：

```bash
npm install
npm run dev
```

## 提交前检查

每次提交前至少运行：

```bash
npm run check
npm test
npm run build
git diff --check
```

涉及页面交互时，还应在浏览器开发服务器或 Electron 应用中手动验证对应流程，并检查控制台没有错误。

## 分支和提交

- `main` 保持可构建状态。
- 功能使用 `feat:`，修复使用 `fix:`，文档使用 `docs:`，重构使用 `refactor:`。
- 一个提交尽量只包含一个完整目的；不要把本地 `dist/`、`release/`、日志或个人书签文件提交进仓库。
- 提交前确认没有把真实 kubeconfig 内容、证书、Token 或私有地址写入示例数据。

## 数据和隐私边界

当前应用只在本机保存元数据和用户主动导入的内容。新增功能时应遵循以下约束：

1. 只读取用户明确选择或粘贴的 kubeconfig；不上传、记录到日志或提交证书、Token、私钥和真实配置，不执行认证插件。
2. 命令生成器默认只生成可复制文本，不在后台执行命令。
3. 导入、导出和迁移逻辑要兼容旧数据，并为新增字段提供默认值。
4. 文件和目录导入只读源文件；仅明确保存详情时写回。剪贴板新建文件须位于仓库外，使用独占创建避免覆盖同名文件。
5. 测试使用 `tests/kube-import.test.mjs` 动态生成的 `.invalid` 示例和系统临时目录，禁止读取用户真实配置作为测试样例。

## 发布检查

生成 macOS 本地开发包（ad-hoc，仅本机验证）：

```bash
npm run app:dir
npm run app:dmg
```

发布前确认：

- 应用能从 `release/local-macos/mac-arm64/Orbit Workbench.app` 启动。
- 书签页面和 Kubeconfig 页面均能打开。
- 亮色/暗色主题、分组、详情、Context 和命令复制流程正常。
- 命令管理弹窗中的长名称、长命令和说明不会被输入框截断。
- Kubeconfig 添加流程验证了无后缀文件、`.txt` 文件和粘贴内容。
- 发布包不包含测试数据或敏感文件。

正式 macOS 发布执行 `npm run app:release:mac`，需先配置 Developer ID Application 证书与 Apple 公证凭据；禁止把 `-local.dmg` 作为正式安装包上传。脚本会检查签名、Hardened Runtime、公证票据、Gatekeeper、镜像校验和以及挂载后的实际应用，详见 [macOS 签名与分发](docs/macos-distribution.md)。

## 远程仓库

默认远程仓库为：

```text
git@github.com:oceanweave/orbit-workbench.git
```

首次配置或检查远程地址：

```bash
git remote -v
git remote set-url origin git@github.com:oceanweave/orbit-workbench.git
```

推送前先同步远程 `main`，确认没有冲突后再推送：

```bash
git fetch origin
git push -u origin main
```
