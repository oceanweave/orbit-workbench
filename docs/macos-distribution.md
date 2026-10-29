# macOS 签名与分发

## 现有问题与修复边界

2026-10-30 本机检查发现：已安装应用仍为 0.1.4；0.2.0 本地 DMG 的镜像校验通过，但内部应用 `codesign --verify --deep --strict` 报资源签名不完整，`spctl --assess` 拒绝。包保留了 Electron 主可执行文件的临时签名，改名后的应用资源未被完整封装。本机没有有效 Developer ID Application 身份。

0.2.1 将两种构建分开：

| 用途 | 命令 | 产物与保证 |
| --- | --- | --- |
| 本机开发 | `npm run app:dir` / `npm run app:dmg` | `release/local-macos/`，完整 ad-hoc 签名；DMG 名带 `-local`。不具备跨机分发信任 |
| 正式分发 | `npm run app:release:mac` | `release/`，arm64 与 x64 DMG；强制 Developer ID 签名、公证与验收 |

ad-hoc 签名通过只代表资源完整，不等于 Apple 信任。不能凭本机启动成功认定其他 Mac 可正常打开；不能将“右键打开”、删除隔离属性或关闭 Gatekeeper 当作分发修复。

## 需要由应用所有者准备的 Apple 身份

需要有效 Apple Developer Program 账号、**Developer ID Application** 证书及其对应私钥（不是 Apple Development、Apple Distribution 或 Developer ID Installer），以及 Apple 公证认证。Apple 公证会将程序安装包发送给 Apple 检查，安装包不得包含个人书签、命令记录或 kubeconfig。

仓库 Settings → Secrets and variables → Actions → Repository secrets 配置：

| Secret 名称 | 用途 |
| --- | --- |
| `MAC_CSC_LINK` | 包含证书及私钥的 `.p12` 的 base64 内容；由 electron-builder 导入临时钥匙串 |
| `MAC_CSC_KEY_PASSWORD` | `.p12` 导出密码 |
| `APPLE_ID` | 有权提交公证的 Apple 账号 |
| `APPLE_APP_SPECIFIC_PASSWORD` | Apple 应用专用密码，不是账号登录密码 |
| `APPLE_TEAM_ID` | Developer 团队 ID |

在“钥匙串访问”中展开 Developer ID Application 身份，确认包含私钥，再导出 `.p12`。证书、私钥和密码只放系统钥匙串或 GitHub Secrets，**不要粘贴到聊天、源码、Issue、日志或提交**。`.p12` / `.p8` / `.cer` 等已忽略；忽略规则不能代替对暂存文件的检查。

本机可直接使用系统钥匙串中的有效 Developer ID，公证凭据可通过 `xcrun notarytool store-credentials orbit-notary` 交互存储。设置 `APPLE_KEYCHAIN_PROFILE=orbit-notary` 后运行预检及正式构建。环境变量通过当前终端或安全凭据管理器配置，不写进仓库。

本机也支持 `APPLE_API_KEY`（指向仓库外 `.p8` 的绝对路径）、`APPLE_API_KEY_ID`、`APPLE_API_ISSUER`；当前锁定的工具版本不支持把 base64 `.p8` 直接当路径。CI 默认使用上表的 Apple ID 方案。

```bash
npm run app:release:mac:preflight
npm run app:release:mac
```

预检只确认必要字段和签名身份存在，不代表凭据有效或公证已通过。Apple 验证失败、证书过期、撤销、无权限或网络错误仍会使正式构建失败。

## 正式构建的验收门槛

1. 用固定 electron-builder 26 配置启用 `forceCodeSigning`、distribution、Hardened Runtime 和 Electron JIT 权限。签名选项位置在 v27 改变，升级时须重新验证。
2. 签名、公证并 staple 应用，然后构建两个架构的 DMG；DMG 自身也签名、公证并 staple。
3. 对应用执行完整 `codesign` 校验，确认 Developer ID 和 Runtime；用 `stapler validate` 检查票据，`spctl --assess --type execute` 检查 Gatekeeper。
4. 对最终 DMG 验证镜像校验和、Developer ID 签名、公证票据及 `spctl --type open`；只读挂载 DMG，重新检查其中的应用，并核对 app.asar 摘要及隐私白名单。
5. 任意步骤失败不上传 macOS 资产，不创建正式 Release。两个系统的构建成功后提供 `SHA256SUMS.txt`，用于下载后核验完整性。

这些检查不能替代在另一台 Mac 上的首次安装测试。正式验收应在对应架构上从浏览器下载 Release DMG，保留系统下载隔离属性，拖到 Applications、首次启动，验证界面、剪贴板、文件导入和写回；还应离线验证 stapled 票据可用。arm64 用于 Apple Silicon，x64 用于 Intel，不能将架构错误误判成证书问题。

## 安装和升级

更新只替换 `/Applications/Orbit Workbench.app`。保留 bundle ID、productName、包名以及既有 userData 目录；不删除用户目录，不迁移或读取用户真实配置进行打包测试。退出旧应用后再替换，避免同时运行两个副本。本机旧应用可先备份到被忽略的 `release/install-backups/` 便于恢复。

0.2.0 及更早 Release 没有经过本流程，不会因代码更新自动变成已公证。只有拿到有效签名凭据、完成正式构建并在另一台 Mac 验收后，才应创建新的发布 tag。不要覆盖已发布 tag 或把本地开发包改名冒充正式包。

## 依据

- [Apple：安全打开 Mac 应用](https://support.apple.com/en-us/102445)
- [Apple：分发前对 macOS 软件进行公证](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)
- [electron-builder 26：macOS 配置](https://www.electron.build/v26/docs/mac/)
- [electron-builder 26：公证与凭据](https://www.electron.build/v26/docs/notarization/)
- [Electron notarize：应用与 DMG 的公证流程](https://github.com/electron/notarize)
