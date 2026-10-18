# Android releases

Builds run on pushes to main. GitHub Actions publishes a debug APK under the build run's artifacts. To publish a signed release, open Actions > Android APK > Run workflow and enable Publish signed release. The workflow uses the version in gradle.properties, checks whether the version tag already exists, builds and verifies the signed APK, and publishes Gui-Cutter.apk.

Configure two GitHub Actions repository secrets under Settings > Secrets and variables > Actions: ANDROID_KEYSTORE_BASE64 (Base64 encoding of the PKCS12 keystore file) and ANDROID_KEYSTORE_PASSWORD (the store and key password). Key alias: guicutter. Keystore must be PKCS12, RSA 3072-bit or stronger. Keep a private backup of the keystore and its password. NEVER add either to the public repository.

Increase appVersion in gradle.properties before each subsequent release. APK upgrades require the same application ID, signing certificate and a larger versionCode. The debug APK uses a different key and cannot update the signed release. Play Protect checks are controlled by Android.

Development logs are available with Export log. Do not retry failed builds blindly; inspect the first failing workflow step.
