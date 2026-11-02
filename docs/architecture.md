# Architecture and routing contract

The client imports one stable file:

```text
https://config.qihao.dev/shadowrocket/main.conf
```

Every build derives a release ID from the base configuration, service rules,
and pinned upstream hashes. The stable file references rule files under that
release ID. This avoids mixing old and new rule files during a deployment and
keeps the large mainland China lists out of the main configuration.

Cloudflare Pages publishes the complete `dist/` directory as one deployment.
The stable configuration and metadata revalidate on every request. Versioned
rule files are immutable and may be cached for a year.

## Rule order

Shadowrocket applies the first matching rule. The generated order is:

1. Private names and local address ranges use `DIRECT`.
2. Explicit overseas services use `PROXY`.
3. The pinned GFW list uses `PROXY`.
4. Mainland China domains and address ranges use `DIRECT`.
5. The client's China GeoIP database is a final direct fallback.
6. Unmatched traffic uses `PROXY`.

The explicit service layer is intentionally before the broad direct list. For
example, an upstream direct list may contain Google endpoints that are reachable
inside mainland China. The product requirement says Google should use the
proxy, so the explicit `google.com` suffix wins.

This is destination-based routing. If two apps contact the same destination,
they receive the same policy. iOS app identity is not part of this personal
Shadowrocket configuration.

## DNS and leak behavior

- `DIRECT` domain rules use system DNS so mainland services retain local CDN
  answers on both Wi-Fi and cellular networks.
- Proxy destinations keep Shadowrocket's default remote-resolution behavior;
  local host mappings are not applied to them.
- Private DNS answers are accepted so routers and LAN services remain usable.
- If the selected node does not support UDP relay, matched proxy traffic is
  rejected rather than falling back to a direct connection.
- HTTPS interception is disabled. The configuration does not install a CA or
  decrypt application traffic.

These defaults favor predictable routing. A phone acceptance test still has to
confirm the selected node supports the protocols used by ChatGPT Voice and
media-heavy apps.

The explicit ChatGPT domains are based on OpenAI's maintained
[network recommendations](https://help.openai.com/en/articles/9247338-network-recommendations-for-chatgpt-errors-on-web-and-apps).

## Trust boundaries

The repository publishes routing data only. It must never contain a proxy node,
node subscription URL, password, UUID, private key, cookie, or access token.

Upstream downloads are staged and validated before replacing pinned snapshots.
The build verifies every snapshot hash from `upstream/lock.json`. A partial or
invalid sync therefore cannot produce a release that passes `npm test`.
