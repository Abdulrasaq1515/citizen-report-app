# CitizenReport — Setup & Build Guide

This is a complete Cordova app source for the Bincom Mobile App test. It is **not yet compiled
into an APK** — you need to build that yourself using Cordova CLI + Android Studio, since compiling
requires the Android SDK which isn't available in the environment this was built in.

---

## 1. What's included

```
citizen-report-app/
  config.xml              <- Cordova config, declares plugins used
  www/
    index.html             <- App screens (Login, Report, Browse)
    css/style.css
    js/config.js            <- EDIT THIS: put your WordPress site URL here
    js/app.js               <- All app logic
    img/placeholder.jpg
```

## 2. Set up your WordPress backend (required)

The app needs a real WordPress site to talk to:

1. Any WordPress hosting works (even a free host, or a local install with a public URL via ngrok
   for testing).
2. Install and activate the plugin **"JWT Authentication for WP REST API"** (search for it in
   Plugins > Add New). This is what makes the login feature work.
3. In `wp-config.php`, add the JWT secret key the plugin asks for, and enable CORS headers per the
   plugin's own instructions (needed so the app running from a `file://` or app origin can reach it).
4. Under **Posts > Categories**, create categories matching the incident types you want, e.g.
   `Accident`, `Fighting`, `Rioting`.
5. Make sure at least one WordPress user exists that you can log in with from the app.

Then open `www/js/config.js` and replace:
```js
WP_BASE_URL: "https://YOUR-WORDPRESS-SITE.com",
```
with your actual site URL (no trailing slash).

## 3. How each requirement is implemented

| Requirement | Where |
|---|---|
| Add new incident | `addScreen` in index.html + `submitIncident()` in app.js |
| Browse all incidents | `browseScreen` + `loadIncidents()` |
| Auto-posted so others can see it | Post is created with `status: "publish"` immediately |
| Notify user of new incident | `notifyNewIncident()` — local notification on submit (see note below) |
| Browse by category | Category `<select>` filters + WordPress `categories` taxonomy |
| Geolocation (lat/lng) | `captureLocation()` using `navigator.geolocation` (Cordova geolocation plugin) |
| Picture of incident | `capturePhoto()` using the Cordova Camera plugin, uploaded to WP Media Library |
| Login | `setupLoginScreen()` using the WordPress JWT Authentication plugin |

**Note on notifications:** the app fires a *local* notification on the same device the moment
that device's user submits a report. Notifying *other* users' phones when someone else posts
(true push notification) needs a push service (like Firebase Cloud Messaging) wired to a
WordPress webhook — that's a separate backend project beyond what a basic Cordova/WP setup
can do out of the box. Worth mentioning this honestly if asked in an interview.

## 4. Building the actual APK

You'll need, on your own computer:

Then, from inside the `citizen-report-app` folder:

```bash
cordova platform add android
cordova build android
```

The unsigned debug APK will be generated at:
```
platforms/android/app/build/outputs/apk/debug/app-debug.apk

Per their instructions:
- The **APK** from the build output above
- The **`www` folder** (already included here)
## Push to GitHub & run CI build

To produce an APK using the included GitHub Actions workflow, push this repository to GitHub and run the workflow.

1. Create a new repository on GitHub (via the website).
2. From your project root, run:

```bash
git init
git branch -M main
git add .
git commit -m "Initial commit: CitizenReport app + CI workflow"
git remote add origin https://github.com/<youruser>/<yourrepo>.git
git push -u origin main
```

3. Open the repository on GitHub -> Actions -> choose the "Build Android APK" workflow and run it (or push to `main` to trigger automatically).

4. When the workflow completes, download the `app-debug-apk` artifact from the workflow run — that APK is the debug build you can submit for assessment.

If you'd like, I can create a polished release-signed APK too (requires a keystore and GitHub secrets).
- The **`config.xml`** file (already included here)

Upload all three to Google Drive, set sharing to "anyone with the link," and submit the link
through their form along with your name.

## 6. Testing without building an APK first

You can preview the UI logic in a regular desktop browser by opening `www/index.html` directly —
navigation, forms, and API calls to WordPress will work. Camera and native geolocation will not
work properly outside a real device/emulator (the code checks for this and won't crash, it just
won't have camera/GPS access).
