package com.movieflix.tv

import kotlinx.serialization.Serializable

@Serializable
data class StreamResolution(
    val success: Boolean = false,
    val url: String? = null,
    val kind: String? = null,
    val motivo: String? = null,
    val erro: String? = null,
    val authorized: Boolean? = null,
    val trial: Boolean? = null,
)
