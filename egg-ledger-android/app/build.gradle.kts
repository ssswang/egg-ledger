plugins { id("com.android.application") }

android {
    namespace = "com.eggledger.app"
    compileSdk = 35

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        applicationId = "com.eggledger.app"
        minSdk = 24
        targetSdk = 35
        versionCode = 3
        versionName = "1.1.0"
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
