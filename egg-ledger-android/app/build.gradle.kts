import java.util.Properties

plugins { id("com.android.application") }

val releaseSigningProperties = Properties().apply {
    val propertiesFile = rootProject.file("key.properties")
    if (propertiesFile.isFile) propertiesFile.inputStream().use { load(it) }
}
val releaseSigningReady = listOf("storeFile", "storePassword", "keyAlias", "keyPassword")
    .all { !releaseSigningProperties.getProperty(it).isNullOrBlank() }

android {
    namespace = "com.eggledger.app"
    compileSdk = 35

    if (releaseSigningReady) {
        signingConfigs {
            create("release") {
                storeFile = rootProject.file(releaseSigningProperties.getProperty("storeFile"))
                storePassword = releaseSigningProperties.getProperty("storePassword")
                keyAlias = releaseSigningProperties.getProperty("keyAlias")
                keyPassword = releaseSigningProperties.getProperty("keyPassword")
            }
        }
        buildTypes.getByName("release").signingConfig = signingConfigs.getByName("release")
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        applicationId = "com.eggledger.app"
        minSdk = 24
        targetSdk = 35
        versionCode = 9
        versionName = "1.2.4"
    }
}

val webAppSource = file("../../egg-ledger-pwa")
val webAssetsDestination = file("src/main/assets")
tasks.register<Copy>("copyWebApp") {
    from(webAppSource)
    into(webAssetsDestination)
    include("index.html", "styles.css", "app.js", "manifest.webmanifest", "service-worker.js", "icon.svg", "reward-clean-background.jpg")
}
tasks.named("preBuild").configure { dependsOn("copyWebApp") }

// Require the original release key so the APK can update existing installations.
tasks.matching { it.name == "preReleaseBuild" }.configureEach {
    doFirst {
        check(releaseSigningReady) { "Complete the local key.properties signing configuration before building Release." }
    }
}

tasks.matching { it.name == "assembleRelease" }.configureEach {
    doLast {
        copy {
            from(layout.buildDirectory.dir("outputs/apk/release"))
            include("app-release.apk", "output-metadata.json")
            into(layout.projectDirectory.dir("release"))
        }
    }
}
