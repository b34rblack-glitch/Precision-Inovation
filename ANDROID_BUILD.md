# Getting Precision Innovation onto an Android phone

Every push to this repository builds an installable APK on GitHub Actions
(`.github/workflows/android-apk.yml`). You do not need Android Studio, a Mac, or
an Expo account.

## Download

Each branch keeps its newest build as a GitHub Release:

- **main:** <https://github.com/b34rblack-glitch/Precision-Inovation/releases/tag/apk-main>
- any other branch: `https://github.com/b34rblack-glitch/Precision-Inovation/releases/tag/apk-<branch>`
  (slashes in the branch name become dashes)

The release page lists one `.apk` file named
`precision-innovation-<version>-<branch>-<commit>.apk`. Open that link on the
phone and tap the file, or download it on a computer and copy it over.

You can also start a build by hand: **Actions → Android APK → Run workflow**,
pick the branch, and the APK appears as the run's artifact and on the release
page about fifteen minutes later.

## Install

1. Tap the downloaded `.apk`. Android asks to allow installs from this source
   (Chrome, Files, or whichever app opened it); allow it once.
2. Tap **Install**. Updating is the same: install the newer APK over the old
   one and your data stays.
3. Google Play Protect may warn that the app is not from the store. Tap
   **Install anyway**. The APK is signed with the project's debug keystore,
   which is why Play Protect does not recognise it.

Every build is signed with the same keystore, so a newer APK always installs
over an older one. Uninstalling the app deletes its database: export a backup
from Settings first if you want to keep your data.

## What this build can and cannot do

- Everything on the phone works: rifles, loads, workups, sessions, range cards,
  field mode, PDF export, backups and sharing.
- **Google Drive sync is off** in this build because `googleWebClientId` in
  `app.json` is blank. Follow `docs/google-cloud-setup.md`, fill it in, and the
  next build will have sync.
- The debug keystore is fine for your own phones and friends. Putting the app
  on the Play Store needs a proper upload keystore; wire it into
  `android/app/build.gradle` via `expo prebuild` config or switch to EAS Build
  (`eas build --platform android --profile production`).
