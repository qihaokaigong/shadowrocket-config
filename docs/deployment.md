# Cloudflare Pages deployment

Use a dedicated Pages project so configuration releases are independent of the
existing application at `hey.qihao.dev`.

## Project settings

- Production branch: `main`
- Build command: `npm test`
- Build output directory: `dist`
- Node.js: 22 or newer
- Custom domain: `config.qihao.dev`

The domain must be added through the Pages custom-domain flow. Verify that the
hostname has no existing DNS record or application route before attaching it.

## Production checks

After deployment, check all of the following from a network independent of the
build environment:

```text
GET /shadowrocket/main.conf       200, text/plain
GET /shadowrocket/metadata.json   200, application/json
GET /shadowrocket/releases/<version>/services.list  200, text/plain
GET /missing                      404, never an HTML application fallback with 200
```

The release ID in `main.conf` must equal `metadata.json.version`. Recompute the
main configuration SHA-256 and compare it with `metadata.json.main_sha256`.

Only after those checks pass should the phone refresh the stable URL.

## Upstream refresh

The scheduled workflow runs daily and opens or updates a pull request only when
the pinned snapshots change. It does not merge automatically. Review the source
counts, content hashes, routing tests, and any unusually broad rule additions
before merging.

Cloudflare Pages deploys after the checked pull request is merged. If production
verification fails, roll back to the previous successful Pages deployment and
revert the source change before the next build.
