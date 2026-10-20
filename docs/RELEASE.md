# Signed release workflow

A single GitHub Actions workflow runs on pushes to `main` and on manual dispatch. It runs JS and Android tests and lint, builds one **signed** APK, verifies it, then publishes the new version as a GitHub Release. No separate development APK, password page, updater server or emulator is required for routine source changes.

The version is configured in `gradle.properties` as `appVersion=0.1.13`, with a deterministic Android versionCode. Increase it for each published version; GitHub will refuse a duplicate version tag instead of rebuilding endlessly.

The repository needs the existing **same** GitHub Actions secrets that signed v0.0.1: `ANDROID_KEYSTORE_BASE64` and `ANDROID_KEYSTORE_PASSWORD`. The key alias is `guicutter`. **Never regenerate or publish the keystore.** Android updates are only accepted for the same package ID (`nl.mrtherich.guicutter`) and certificate.

Download the official APK from GitHub Releases, then open it using Android's package installer. Future versions can be checked and downloaded from the Settings drawer in the app. Logs can be exported from Settings > Developer. If the build fails, inspect the first failing step and fix that cause, rather than repeatedly rerunning it.