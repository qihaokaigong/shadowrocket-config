# ZeroOmega / SwitchyOmega browser rules

Rule list URL: `https://config.qihao.dev/switchy/rules.txt`

This file uses `[SwitchyOmega Conditions]` with `@with result`. It is separate
from the Shadowrocket configuration and cannot be imported as a proxy server.

1. Use the existing proxy profile named exactly `proxy_us` and confirm it works
   when selected on its own. Point it at a working HTTP or SOCKS5 proxy on this computer. The list uses ZeroOmega's
   built-in `direct` profile for direct connections.
2. Create a Rule List profile, choose the SwitchyOmega/Switchy format, and use
   the URL above as its source. Apply changes and select this profile.
3. Refresh the rule list after a release. Test `baidu.com` and `taobao.com`
   as direct, and `chatgpt.com`, `google.com`, and `youtube.com` as proxied.

The list is intentionally small: explicit overseas service domains are first;
`.cn` and a curated set of mainland services are direct; everything else uses
`proxy_us`. Add missing direct domains to `config/switchy-direct.json` after
checking the extension's active decision. This browser-only list does not have
Shadowrocket's China GeoIP and IP CIDR rules, and does not route other apps.

No proxy credentials, server addresses, or node subscriptions are published
in this public rule list. The profile named `proxy_us` remains local to ZeroOmega.
