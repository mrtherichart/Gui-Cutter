plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val appVersion = providers.gradleProperty("appVersion").get()
val versionParts = appVersion.split(".").map { it.toIntOrNull() ?: error("Invalid appVersion: $appVersion") }
require(versionParts.size == 3 && versionParts[0] in 0..2000 && versionParts[1] in 0..999 && versionParts[2] in 0..999) {
    "appVersion must be major.minor.patch (minor and patch < 1000)"
}
val versionNumber = versionParts[0] * 1_000_000 + versionParts[1] * 1_000 + versionParts[2]
val devLogs = providers.gradleProperty("devLogs").getOrElse("true")
require(devLogs == "true" || devLogs == "false") { "devLogs must be true or false" }

android {
    namespace = "nl.mrtherich.guicutter"
    compileSdk = 35

    defaultConfig {
        applicationId = "nl.mrtherich.guicutter"
        minSdk = 26
        targetSdk = 35
        versionCode = versionNumber
        versionName = appVersion
        buildConfigField("boolean", "DEV_LOGS_ENABLED", devLogs)
    }

    signingConfigs {
        create("publish") {
            val keystore = System.getenv("ANDROID_KEYSTORE_FILE")
            if (!keystore.isNullOrBlank()) storeFile = file(keystore)
            storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
            keyAlias = "guicutter"
            keyPassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
        }
    }

    buildTypes {
        getByName("debug") {
            isDebuggable = true
        }
        getByName("release") {
            isMinifyEnabled = false // No fragile reflection/JS-bridge shrink rules in the baseline.
            signingConfig = signingConfigs.getByName("publish")
        }
    }
    buildFeatures { buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    testOptions { unitTests.isReturnDefaultValues = true }
}

dependencies {
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("androidx.documentfile:documentfile:1.0.1")
    implementation("androidx.webkit:webkit:1.14.0")
    testImplementation("junit:junit:4.13.2")
}
