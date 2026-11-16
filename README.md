# 思考等级中文名称

将对话框中的模型思考等级显示为中文，并可在设置页编辑所有可能出现等级的映射。

- 包名：`@local/dsh-thinking-level-zh`
- 版本：`1.0.0`

## 功能

- Host 侧能力：通过 `cordis.patch.yml` 注册插件行，加载时自动生效。
- Web UI：注册浏览器端界面，随 DSH Web 页面一起渲染。

## 安装

1. 打开 DSH 的「插件」页，选择「安装 → 本地目录」。
2. 选择这个目录：

   ```text
   D:\DeepseekWorkArea\插件\thinking-level-zh
   ```

3. 安装完成并在插件列表中启用后，刷新页面即可看到入口。

也可以让 Agent 直接执行安装，把上面的绝对路径作为 target：

```text
plugin_manager install_bundle  target=<上面的目录>
```

## 文件结构

| 文件 | 大小 |
| --- | --- |
| client.js | 21.2 KB |
| cordis.patch.yml | 81 B |
| icon.svg | 451 B |
| index.js | 1.1 KB |
| locale/en.json | 226 B |
| locale/zh.json | 197 B |
| package.json | 817 B |
| pnpm-lock.yaml | 921 B |
| test/config.test.mjs | 3.0 KB |

## 配置

插件配置位于 profile 的 `cordis.patch.yml` 中对应插件行的 `config` 字段；界面文案见 `locale/`。

## 开发

这是一个普通 ESM 包，无需构建步骤；修改 `index.js`（Host）或 `client.js`（Web UI）后重新加载插件即可。

## 许可

本仓库未自动附带许可证文件；如需开源，请补充 `LICENSE` 并在此说明。

---

本文档由 DSH 插件「插件发布（GitHub）」自动生成。
