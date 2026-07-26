# Setting up Google sign-in for cloud sync

Cloud sync stores each user's data in a folder in **their own** Google Drive.
There is no server and no database to pay for. This is the one-time setup that
makes that work.

All of it is free. None of the steps below cost money, now or later.

---

## Do this first: the Android package name

`app.json` currently declares:

```json
"package": "com.anonymous.precisioninnovation"
```

That is the Expo scaffold default. It matters for two reasons:

1. **It cannot be changed after your first upload to Google Play.** The package
   name is the app's permanent identity on the store.
2. **The Android OAuth client is bound to it.** Registering the client against
   `com.anonymous.*` and then changing the package means redoing the OAuth
   setup and breaking sign-in for anyone who already installed.

Change it to something you own — for example `com.precisioninnovation.app` —
in both `expo.android.package` and `expo.ios.bundleIdentifier`, **before** you
create the OAuth clients below and before your first Play upload.

---

## 1. Create the project and enable the API

1. <https://console.cloud.google.com> → new project, e.g. `precision-innovation`.
2. **APIs & Services → Library → Google Drive API → Enable.**

Enable only the Drive API. Nothing else is needed.

## 2. Configure the consent screen

3. **Audience → External.**
4. **Branding:** app name, user support email, developer contact email.

   > **Do not upload an app logo.** Uploading a logo triggers Google's brand
   > verification review even when every scope you request is non-sensitive.
   > That review can take weeks and you gain nothing from it here.

   You will need a homepage URL and a privacy policy URL to publish. GitHub
   Pages is free and sufficient, and you need a privacy policy for Play anyway.

5. **Data access → Add scope →
   `https://www.googleapis.com/auth/drive.file` only.**

   This scope is **non-sensitive**. It lets the app see only files it created
   itself — never the rest of the user's Drive. That classification is the whole
   reason this design costs nothing: sensitive and restricted scopes require an
   annual third-party security assessment (CASA), which is not free.

   Do **not** add `drive`, `drive.readonly`, or `drive.metadata`. Any one of
   them is a restricted scope and changes that.

   `openid`, `email` and `profile` are also non-sensitive and are requested
   automatically by the sign-in library.

6. **Audience → Publishing status → PUBLISH APP → In production.**

   > **This step is not optional, and skipping it produces a genuinely baffling
   > bug.** While the consent screen is in *Testing*, Google expires refresh
   > tokens after **seven days**. Sync would work perfectly, and then every user
   > would be silently signed out a week later.
   >
   > With only non-sensitive scopes, publishing is instant. There is no review
   > queue, no verification, and no user cap.

## 3. Create the OAuth clients

**Credentials → Create credentials → OAuth client ID.**

### Android client — one per signing key

Package name: whatever you set in step 0. SHA-1 certificate fingerprint: you
need **two** clients, same package name, different fingerprints.

- **Your build key:** `eas credentials` → Android → your profile → Keystore.
  (For a local debug build:
  `keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android`)
- **Google Play's signing key:** Play Console → your app → Release → Setup →
  App signing → "App signing key certificate" → SHA-1.

  > Registering only your upload key is the single most common production
  > failure with Google Sign-In. Sign-in works perfectly for you and fails for
  > every single person who installs from Play, because Play re-signs your app
  > with its own key. Register both.

### Web client

Create an **OAuth client ID → Web application**. No redirect URIs needed. This
one exists because the Android sign-in library requires a `webClientId` to
identify your project; it is not used for a web app.

### Desktop client (for the Windows app)

Create an **OAuth client ID → Desktop app**. No redirect URIs to fill in —
Google automatically permits `http://127.0.0.1:<any port>` for this client type.

> The desktop client has a "client secret". For an installed application it is
> **not actually secret** — Google's own documentation says so, because anyone
> can extract it from the binary. PKCE is what protects the flow. Do not waste
> effort trying to hide it.

## 4. Put the web client ID into the app

In `app.json`:

```json
"extra": {
  "googleWebClientId": "1234567890-abcdef.apps.googleusercontent.com"
}
```

Without it, the Settings screen shows sync as unavailable rather than failing at
sign-in time.

## 5. Build

Google Sign-In needs native code, so it does **not** work in Expo Go. Use a
development build:

```bash
npx expo install expo-dev-client
eas build --profile development --platform android
```

The rest of the app still runs in Expo Go; only the sync section is inert there,
and it says so.

---

## Play Store data safety

When you fill in the Data Safety form, the accurate answers are:

- The app accesses Google Drive **on the user's own account**.
- Data is **not shared with third parties** — there is no server; it goes from
  the device to the user's own Drive.
- Data is **encrypted in transit** (HTTPS to Google's API).
- Users can request deletion by deleting the folder in their Drive.

---

## What the user sees

A folder called **Precision Innovation** in their My Drive, containing a
`README.txt` and a `devices/` folder with one small JSON file per device. They
can copy it as a backup, or delete it to stop syncing.
