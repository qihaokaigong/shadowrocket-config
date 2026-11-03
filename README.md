# Shadowrocket China-direct configuration

This project generates a versioned Shadowrocket configuration for an iPhone
that remains connected for everyday use:

- local networks and destinations classified as mainland China use `DIRECT`;
- ChatGPT, X, YouTube, Facebook, Reddit, Google, and known GFW destinations use
  `PROXY`;
- unmatched destinations use `PROXY`;
- proxy nodes and credentials remain local to Shadowrocket and are never
  published here.

The stable client URL is designed to be:

```text
https://config.qihao.dev/shadowrocket/main.conf
```

The generated main configuration references stable rule URLs that revalidate.
The first published version's immutable URLs remain available for older phone
configs. A Cloudflare Pages deployment publishes all files atomically.

ZeroOmega's separate SwitchyOmega rule list is published at
`https://config.qihao.dev/switchy/rules.txt`. See [browser setup](docs/switchy.md).

## Local workflow

Node.js 22 or newer is required. There are no package dependencies.

```bash
npm run sync
npm test
```

`npm run sync` downloads every required source into a temporary directory,
validates all files, and replaces the current compressed snapshots only after
every source succeeds. `npm test` builds `dist/` and runs routing regression
checks. Published rule files remain ordinary UTF-8 text for Shadowrocket.

Before importing the configuration on a phone, verify that the local
Shadowrocket version recognizes `PROXY` as the currently selected node policy.
Direct destinations use the current network's system DNS; proxy destinations
are resolved by the proxy path. If a proxy node cannot relay UDP, proxy traffic
is rejected instead of silently leaking through `DIRECT`.

The ChatGPT service rules track OpenAI's published
[network allowlist](https://help.openai.com/en/articles/9247338-network-recommendations-for-chatgpt-errors-on-web-and-apps).
Other service exceptions remain deliberately narrow; the broad overseas
fallback is still `FINAL,PROXY`.

## Cloudflare Pages settings

- Build command: `npm test`
- Build output directory: `dist`
- Production branch: `main`
- Custom domain: `config.qihao.dev`

Do not publish node subscriptions, passwords, UUIDs, WireGuard keys, or other
connection credentials in this repository.
