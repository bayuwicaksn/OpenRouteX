# Accounts (Multi-Account)

Configure and use multiple auth accounts per provider (e.g., multiple Antigravity accounts) with round‑robin selection and automatic cooldown handling.

## Add Multiple Antigravity Accounts

- Log in with distinct labels (optional — if omitted, label defaults to the account email):

```bash
smart-router login antigravity --label work
smart-router login antigravity --label personal
smart-router login antigravity --label backup
```

- Without --label, the profile ID will be antigravity:<email>.

- Verify:

```bash
smart-router accounts
```

Output shows provider, profile ID (antigravity:work, antigravity:personal, …), state (active/cooldown), and email (if available).

## How Rotation Works

- The router uses round‑robin selection for OAuth/device providers:
  - Picks the least recently used active profile
  - Skips profiles in cooldown or disabled state
  - When a request succeeds, the profile’s lastUsed timestamp updates
  - Failures set model‑specific or global cooldowns (e.g., rate limits)

Code references:

- Selection: [pickNextProfile](file:///d:/BAYU/Project/smart-router/src/auth-store.ts#L160-L211)
- Failure handling/cooldowns: [markProfileFailure](file:///d:/BAYU/Project/smart-router/src/auth-store.ts#L263-L317)
- Usage audit: [doAuditLog](file:///d:/BAYU/Project/smart-router/src/proxy.ts#L127-L142)

## See Which Profile Was Used

- Non‑stream responses include routing headers:

```bash
curl -s -D - http://localhost:3403/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"auto","messages":[{"role":"user","content":"Say hi"}]}'
```

Check response headers:

- `X-Smart-Router-Provider`: antigravity
- `X-Smart-Router-Profile`: antigravity:<label>
- `X-Smart-Router-Tier`, `X-Smart-Router-Score`, `X-Smart-Router-Reason`

Streaming responses also include `X-Smart-Router-Provider` and `X-Smart-Router-Profile`.

## Remove/Reset Accounts

- Remove a profile:

```bash
smart-router accounts remove antigravity:work
```

- Clear cooldowns (advanced): use the reset script if needed:
  - [scripts/reset-cooldowns.ts](file:///d:/BAYU/Project/smart-router/scripts/reset-cooldowns.ts)

## Store Location

- Default store path:
  - `src/data/auth-store.json` (resolved to `data/auth-store.json` at runtime)
- Override with environment variable:

```bash
# PowerShell
$env:SMART_ROUTER_AUTH_STORE='D:\path\to\auth-store.json'

# Git Bash
SMART_ROUTER_AUTH_STORE=D:/path/to/auth-store.json
```

Code reference:

- [auth-store.ts](file:///d:/BAYU/Project/smart-router/src/auth-store.ts#L17-L21)

## Notes

- For explicit model targeting with Antigravity, use provider/model:
  - `antigravity/gemini-3-flash`
- When all Antigravity profiles are rate‑limited, router falls back to other providers if available; otherwise returns 429 with a Retry‑After header.
