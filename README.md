This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Web Search Tool

The agent can enrich non-knowledge-base fallback answers with a configurable HTTP search tool.
It is disabled unless `WEB_SEARCH_ENDPOINT` is set.

```bash
WEB_SEARCH_PROVIDER=generic
WEB_SEARCH_ENDPOINT=https://your-search-service.example/search
WEB_SEARCH_API_KEY=your-search-key
WEB_SEARCH_MAX_RESULTS=3
WEB_SEARCH_TIMEOUT_MS=5000
```

The generic endpoint is called with `POST` JSON:

```json
{
  "query": "猫 排尿困难 兽医 宠物疾病 急症处理",
  "q": "猫 排尿困难 兽医 宠物疾病 急症处理",
  "max_results": 3,
  "maxResults": 3
}
```

Supported response shapes include `results`, `organic_results`, `items`, or `webPages.value`.
Each item should include a `title`, `url` or `link`, and `snippet`, `content`, or `description`.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
