# Phone rollout and acceptance

Complete this checklist with the actual iPhone before treating a release as
production-ready.

## Baseline and recovery

1. Record the iOS and Shadowrocket versions.
2. Export or duplicate the currently working local configuration.
3. Confirm at least one working node supports TCP and UDP.
4. Keep the node subscription separate from this routing configuration.

## Import

1. Add the stable configuration URL shown in the project README.
2. Select the downloaded configuration.
3. Set Global Routing to Config.
4. Connect Shadowrocket and keep the existing working node selected.
5. Confirm the release ID in `main.conf` matches the published
   `metadata.json` version.

The exact background refresh and On Demand controls vary by client version.
Record their observed behavior before documenting an automatic refresh
interval. A successful server deployment does not prove that the phone has
loaded the new configuration.

## Functional checks

Clear the Shadowrocket request log before each group. Exercise fresh network
requests instead of cached pages.

- ChatGPT: sign in, send a message, upload a file, download a file, and start a
  voice session.
- X, YouTube, Facebook, Reddit, and Google: sign in where relevant, load media,
  and follow at least one API-backed interaction.
- Mainland China: test Baidu, QQ or WeChat, Taobao, and Bilibili.
- Local network: open the router or another LAN device.
- Repeat the checks on Wi-Fi and cellular data.

Expected log result:

- named overseas services and other unmatched overseas destinations show
  `PROXY`;
- mainland China services, China IP destinations, and LAN destinations show
  `DIRECT`.

For a failure-path check, keep the Shadowrocket tunnel connected and select a
temporarily unusable proxy node. Fresh overseas requests should fail while
fresh mainland China and LAN requests remain available. Restore the working
node immediately after the check.

## Rollback drill

1. Roll Cloudflare Pages back to the previous successful production deployment.
2. Read back `main.conf` and `metadata.json` and confirm the previous version.
3. Refresh the configuration on the phone and reconnect if the observed client
   version requires it.
4. Repeat one proxy, one mainland China direct, and one LAN test.
5. If the remote configuration cannot be refreshed, activate the saved local
   configuration.
