# ZeroOmega / SwitchyOmega browser rules

Rule list URL: `https://config.qihao.dev/switchy/rules.txt`

The file uses plain `[SwitchyOmega Conditions]` syntax. It contains only
matching host conditions, without `@with result`, result profile names, or a
catch-all rule. ZeroOmega's UI controls both outcomes.

1. In the auto-switch profile, set **Rule list rules** to a working proxy
   profile, such as `proxy_us`, and keep the checkbox enabled.
2. Set **Default** to `[Direct]`.
3. Select **Switchy** as the rule list format and set the URL above. Click
   **Download Profile Now**, apply changes, then select the auto-switch profile
   in the extension popup.
4. Test `x.com`, `chatgpt.com`, and `youtube.com` as proxy matches. Test
   `baidu.com` and `taobao.com` as unmatched direct connections.

The source combines explicit overseas service domains with the pinned GFW
domain list. The GFW list is not exhaustive, so an unlisted overseas domain
will use the UI's default `[Direct]` profile. Add required exceptions to
`config/services.json` after checking the browser's routing decision.

The browser rule list does not contain the Shadowrocket China GeoIP or IP
rules. It does not manage other applications and does not publish proxy nodes,
credentials, or subscriptions.
