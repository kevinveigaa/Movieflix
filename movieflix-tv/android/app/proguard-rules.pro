# MovieFlix TV ProGuard rules (release).
# Glide
-keep public class * implements com.bumptech.glide.module.GlideModule
-keep class com.bumptech.glide.** { *; }
# OkHttp
-dontwarn okhttp3.**
-dontwarn okio.**
# kotlinx.serialization
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**
-keepclassmembers class kotlinx.serialization.json.** { *** Companion; }
-keepclasseswithmembers class kotlinx.serialization.json.** { kotlinx.serialization.KSerializer serializer(...); }
-keep,includedescriptorclasses class com.movieflix.tv.**$$serializer { *; }
-keepclassmembers class com.movieflix.tv.** { *** Companion; }
-keepclasseswithmembers class com.movieflix.tv.** { kotlinx.serialization.KSerializer serializer(...); }
