# Getting Precision Innovation onto an iPhone (no Mac required)

iOS can't be built on Linux, and Apple doesn't allow sideloading a file the way
Android does with an APK. But you do **not** need a Mac — [EAS Build](https://docs.expo.dev/build/introduction/)
compiles the iOS app on Apple hardware in Expo's cloud. You just trigger it from
a Windows or Linux PC.

There are two paths. Pick based on whether you want a real installed app or just
to try it.

---

## Path A — Just try it (free, 5 minutes, no Apple Developer account)

Runs the app live inside the **Expo Go** sandbox app. Needs a computer running a
dev server while you use it — good for testing, not for carrying to the range.

1. On the iPhone: install **Expo Go** from the App Store.
2. On any Windows/Linux PC with this project checked out:
   ```
   npm install
   npx expo start
   ```
3. Scan the QR code shown in the terminal with the iPhone camera. It opens in
   Expo Go. Every save/edit on the PC live-reloads on the phone.

The iPhone and PC must be on the same Wi-Fi. If they can't see each other, run
`npx expo start --tunnel`.

---

## Path B — A real installed app (needs a $99/yr Apple Developer account)

This produces an actual app on the iPhone home screen, installed via TestFlight.
The **only** unavoidable cost is Apple's Developer Program ($99/year) — Apple
requires it to sign any app that runs on a physical iPhone. No Mac needed.

### One-time setup
1. Create a free Expo account: <https://expo.dev/signup>
2. Enroll in the Apple Developer Program: <https://developer.apple.com/programs/>
   ($99/yr; can take a day for Apple to approve.)

### Build it (from a Windows or Linux PC)
```
npm install -g eas-cli
eas login                              # your Expo account
eas build --platform ios --profile preview
```
When prompted, log in with your **Apple ID** — EAS creates and manages all the
signing certificates and provisioning for you. The build runs in Expo's cloud
(~15–25 min) and finishes with a download/QR link.

### Install on the iPhone
- Easiest: submit the build to **TestFlight** and install via the TestFlight app:
  ```
  eas submit --platform ios --latest
  ```
  Then open TestFlight on the iPhone and install.
- Or use the **ad-hoc** link EAS gives you (register the iPhone's UDID first when
  EAS asks).

### Later updates
Re-run `eas build --platform ios --profile preview` (bump `version` in `app.json`
for TestFlight). The `production` profile in `eas.json` auto-increments the build
number for App Store submissions.

---

## Why there's no free "just download it" option for iPhone

- A free Apple ID *can* sideload your own app, but **only from a Mac with Xcode**,
  and it expires after 7 days.
- Every other route to a physical iPhone requires Apple code-signing, which
  requires the paid Developer account.
- This is Apple's platform policy, not a limitation of this app. On Android the
  signed APK installs directly; iOS simply doesn't permit that.

The project is already configured for all of the above: `app.json` has the iOS
bundle identifier, and `eas.json` defines the `preview` (device), `development`,
and `production` build profiles.
