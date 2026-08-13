This folder contains a simple mock Express server that implements a minimal WordPress-like REST API for local testing of the CitizenReport Cordova app.

Usage:

1. Install dependencies:

```bash
cd mock-server
npm install
```

2. Start the server:

```bash
npm start
```

The server listens on port 3000 by default and exposes these endpoints:

- `POST /wp-json/jwt-auth/v1/token` — accepts `{ username, password }`, returns `{ token, user_display_name }`.
- `GET /wp-json/wp/v2/users/me` — returns a mock user when passed `Authorization: Bearer mocktoken-<username>`.
- `GET /wp-json/wp/v2/categories` — returns sample categories.
- `POST /wp-json/wp/v2/media` — accepts `multipart/form-data` with field `file`, returns `{ id, source_url }` and serves uploaded files at `/uploads/...`.
- `GET /wp-json/wp/v2/posts` — returns created posts; supports `categories`, `author`, and `_embed=1` to include media/term data.
- `POST /wp-json/wp/v2/posts` — create a new post (expects `title`, `content`, `categories`, optional `featured_media`).

This mock is lightweight and intended for local app testing; it intentionally accepts any credentials for development convenience.
