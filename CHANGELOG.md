# Changelog

## 0.1.0 - 2026-10-23

### Added

- 书签看板、折叠分组、标签筛选、链接行管理和浏览器书签导入。
- 当前看板和全部看板的 JSON 导出。
- Kubeconfig 路径登记、环境分组、拖拽归类、标签和配置详情编辑。
- Context 列表和命令生成器，点击配置即可生成命令，支持默认命令、命名空间和附加参数。
- 内置 Pod、Node、Service、Deployment、rollout、describe、logs、top 和创建时间排序命令。
- 自定义命令模板、亮色/暗色主题和本地持久化。
- Electron macOS arm64 `.app` 与 DMG 打包配置。
- 原始 kubeconfig YAML 查看和编辑，支持桌面端写回源文件。
- 支持从文件、目录或剪贴板添加配置，并兼容无后缀和 `.txt` 文件。
- 每个配置支持独立配置别名，命令路径包含特殊字符时自动安全转义。
- 常用命令编辑区加宽，分组颜色改为预设色块选择。

### Notes

- 当前数据保存在本地；桌面版可按用户操作写回 kubeconfig 源文件，不会上传配置内容。
- 当前 macOS 包未配置 Developer ID 签名和公证。
- SSH 管理、原生文件解析、Windows 打包和云同步暂未实现。
