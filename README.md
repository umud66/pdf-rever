# PDF 偶数页倒序

PDF 在浏览器本地处理。

```sh
npm run dev    # 本地预览
npm test       # 测试
npm run deploy # 部署到 Cloudflare
```

Cloudflare Workers 连接 GitHub 仓库：根目录 `/`，构建命令留空，部署命令 `npm run deploy`。Worker 名称与 `wrangler.jsonc` 保持一致。
