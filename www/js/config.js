// ===================================================================
// EDIT THIS FILE: point it at your own WordPress site.
// ===================================================================
// Your WordPress site MUST have:
//   1. The REST API enabled (this is on by default in modern WordPress).
//   2. The "JWT Authentication for WP REST API" plugin installed + activated,
//      so the app can log a user in and get a token.
//   3. Categories created that match the incident types you want
//      (e.g. Accident, Fighting, Rioting) under Posts > Categories.
// ===================================================================

const APP_CONFIG = {
  // Example: "https://mysite.com" (no trailing slash)
  WP_BASE_URL: "http://localhost:3000",

  // These are standard WordPress REST API + JWT plugin paths - no need to change.
  ENDPOINTS: {
    LOGIN: "/wp-json/jwt-auth/v1/token",
    POSTS: "/wp-json/wp/v2/posts",
    CATEGORIES: "/wp-json/wp/v2/categories",
    MEDIA: "/wp-json/wp/v2/media",
  },
};
