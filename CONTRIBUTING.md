# Contributing

感谢你愿意改进视频文案采集器。本项目保持轻量：原生 Manifest V3 Chrome/Edge 扩展，没有构建步骤，也不内置任何 API Key。

## 适合贡献的方向

- 修复抖音或小红书页面媒体地址提取失效的问题。
- 增加或维护 ASR provider 适配。
- 改进错误提示、诊断日志和 README 使用文档。
- 补充真实平台兼容性记录和限制说明。
- 改进 Markdown / Obsidian 导出格式。

## 开发环境

1. Fork 或 clone 本仓库。
2. 打开 `chrome://extensions/` 或 `edge://extensions/`。
3. 开启开发者模式。
4. 加载本项目目录。
5. 修改代码后，在扩展管理页点击重新加载。

本项目没有 npm 依赖。提交前建议运行：

```bash
python3 -m json.tool manifest.json >/dev/null
node --check popup.js
node --check options.js
node --check content/page-hook.js
node --check content/cache-listener.js
node --check lib/extractors.js
node --check lib/markdown.js
node --check lib/storage.js
```

## 提交 Pull Request 前

请尽量说明：

- 修复或新增的具体场景。
- 测试过的平台：Chrome / Edge、抖音 / 小红书。
- 使用的 provider：DashScope、豆包语音、腾讯云、OpenAI Audio、Deepgram、AssemblyAI 或自定义 API。
- 是否涉及 API Key、跨域权限、文件上传或隐私影响。

如果问题只在特定页面出现，请提供脱敏后的页面 URL、错误日志或复现步骤。不要提交任何 API Key、账号 Cookie、私密视频链接或带签名的长期可访问媒体 URL。

## Issue 建议格式

```text
平台：抖音 / 小红书
浏览器：Chrome / Edge + 版本
扩展版本：
转写 provider：
现象：
复现步骤：
诊断日志：
期望结果：
```

## 设计原则

- 优先保持扩展轻量，不引入构建链和服务器依赖。
- API Key 只保存在用户本机 `chrome.storage.local`。
- 新 provider 如果需要复杂签名、轮询或对象存储中转，优先做成内置适配，而不是塞进自定义模板。
- 对平台页面的适配要保守处理，避免采集无关数据。
