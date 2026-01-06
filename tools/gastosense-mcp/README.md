# gastosense-dev MCP

Safe MCP helper for the local GastoSense repo.

Tools
- `gs_run`: run allowlisted tasks only
  - `frontend:test`
  - `frontend:lint`
  - `frontend:typecheck`
  - `frontend:build`
  - `functions:test`
  - `functions:lint`
  - `functions:typecheck`
- `gs_read_file`: read a repo file (max 80KB)
- `gs_list_dir`: list a repo folder (limited items)

Repo root detection
- Walks up from `process.cwd()` until it finds both `frontend/package.json` and `functions/package.json`.

Usage examples
```json
{"tool":"gs_run","task":"frontend:lint"}
```
```json
{"tool":"gs_read_file","path":"frontend/src/App.tsx"}
```
```json
{"tool":"gs_list_dir","path":"frontend/src","limit":50}
```
