#!/usr/bin/env bash
set -euo pipefail
mkdir -p .private
if [ -e .private/gui-cutter-signing.jks ]; then echo 'Keystore exists, not overwriting'; exit 1; fi
read -r -s -p 'Enter a new signing password: ' PASSWORD
echo
keytool -genkeypair -noprompt -alias guicutter -keyalg RSA -keysize 3072 -validity 10000 -storetype PKCS12 -keystore .private/gui-cutter-signing.jks -storepass "$PASSWORD" -keypass "$PASSWORD" -dname 'CN=Gui Cutter, O=Mr The Rich, C=NL'
chmod 600 .private/gui-cutter-signing.jks
echo 'Secret names: ANDROID_KEYSTORE_BASE64 and ANDROID_KEYSTORE_PASSWORD'
echo 'Encode file: base64 -w 0 .private/gui-cutter-signing.jks'
echo 'Back up both values privately. Never commit them.'
