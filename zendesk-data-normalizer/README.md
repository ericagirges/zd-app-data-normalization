# Ticket Data Normalizer — Zendesk Support App

A client-side Zendesk Apps Framework (ZAF v2) ticket-sidebar app that converts the current ticket into a stable, AI/integration-friendly JSON payload.

## What it normalizes

- Core ticket metadata
- Requester, assignee, group, organization, brand, and form
- Tags (trimmed, deduplicated, sorted)
- All populated ticket custom fields, discovered dynamically
- Ticket conversation across supported channels
- HTML message bodies converted to plain text
- Empty/null properties removed
- Custom field labels converted to stable snake_case keys while retaining field IDs

## Privacy defaults

- Requester email is excluded unless the agent checks **Include requester email**.
- Internal notes are excluded unless the agent checks **Include internal notes**.

## Local testing with ZCLI

From the app directory:

```bash
zcli apps:validate .
zcli apps:server .
```

Open a Zendesk ticket and append `?zcli_apps=true` to the ticket URL.

## Package/install

You can package the app with ZCLI and upload the resulting ZIP as a private Zendesk app, or use the included ZIP directly if your Zendesk instance accepts the package structure.

## Important customization point

The output shape is defined in `assets/app.js` inside `normalizeTicket()`. That is the place to rename keys, remove fields, add derived values, or POST the normalized payload to an external service using `client.request()`.
