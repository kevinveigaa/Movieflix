# Regras do MovieFlix TV.
# minifyEnabled = false: nada é ofuscado; estas regras ficam como referência.
-keep class com.movieflix.tv.** { *; }
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
