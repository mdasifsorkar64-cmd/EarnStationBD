package com.earnstationbd.app

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.os.Build
import android.view.View
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Button
import android.widget.LinearLayout
import android.graphics.Color
import android.view.Gravity
import android.widget.ImageView
import android.view.animation.AlphaAnimation
import android.view.animation.Animation
import android.view.animation.AnimationSet
import android.view.animation.ScaleAnimation
import android.view.animation.DecelerateInterpolator
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private lateinit var progress: ProgressBar
    private lateinit var root: FrameLayout

    private val homeUrl = "https://earnstationbd.pages.dev/"
    private val allowedHosts = setOf(
        "earnstationbd.pages.dev",
        "accounts.google.com",
        "www.google.com",
        "google.com"
    )

    private fun isAllowedHost(host: String): Boolean =
        allowedHosts.contains(host) || host.endsWith(".supabase.co") ||
            host.endsWith(".googleapis.com") || host.endsWith(".gstatic.com")

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = Color.rgb(16, 27, 85)
        window.navigationBarColor = Color.rgb(16, 27, 85)
        root = FrameLayout(this)
        setContentView(root)

        webView = WebView(this)
        progress = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal)
        progress.max = 100
        root.addView(webView, FrameLayout.LayoutParams(-1, -1))
        root.addView(progress, FrameLayout.LayoutParams(-1, dp(3), Gravity.TOP))
        showAnimatedSplash()

        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            loadsImagesAutomatically = true
            javaScriptCanOpenWindowsAutomatically = false
            setSupportMultipleWindows(false)
            cacheMode = WebSettings.LOAD_DEFAULT
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            allowFileAccess = false
            allowContentAccess = false
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) safeBrowsingEnabled = true
            userAgentString = userAgentString + " EarnStationBDAndroid/1.0"
        }
        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                progress.progress = newProgress
                progress.visibility = if (newProgress >= 100) View.GONE else View.VISIBLE
            }
        }
        webView.webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                progress.visibility = View.VISIBLE
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                progress.visibility = View.GONE
            }

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val uri = request.url
                val scheme = uri.scheme ?: return true
                if (scheme == "http" || scheme == "https") {
                    val host = uri.host ?: return true
                    if (isAllowedHost(host)) return false
                    openExternal(uri)
                    return true
                }
                if (scheme == "tel" || scheme == "mailto" || scheme == "sms") {
                    openExternal(uri)
                    return true
                }
                return true
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) showOffline()
            }
        }

        if (savedInstanceState != null) webView.restoreState(savedInstanceState)
        else webView.loadUrl(homeUrl)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack() else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })
    }

    private fun showAnimatedSplash() {
        val splash = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(Color.WHITE)
            setPadding(dp(24), dp(24), dp(24), dp(24))
        }

        val logo = ImageView(this).apply {
            setImageResource(R.mipmap.ic_launcher)
            scaleType = ImageView.ScaleType.FIT_CENTER
        }
        splash.addView(logo, LinearLayout.LayoutParams(dp(112), dp(112)))

        val appName = TextView(this).apply {
            text = "EarnStationBD"
            textSize = 30f
            typeface = android.graphics.Typeface.create("sans-serif", android.graphics.Typeface.BOLD)
            setTextColor(Color.rgb(16, 27, 85))
            gravity = Gravity.CENTER
            setPadding(0, dp(20), 0, dp(8))
        }
        splash.addView(appName)

        val credit = TextView(this).apply {
            text = "Power by MD ASIF SORKAR"
            textSize = 14f
            letterSpacing = 0.08f
            setTextColor(Color.rgb(90, 98, 120))
            gravity = Gravity.CENTER
            setPadding(0, dp(8), 0, 0)
        }
        splash.addView(credit)

        root.addView(splash, FrameLayout.LayoutParams(-1, -1))

        fun animateIn(view: View, delay: Long) {
            view.visibility = View.INVISIBLE
            view.postDelayed({
                view.visibility = View.VISIBLE
                val fade = AlphaAnimation(0f, 1f).apply {
                    duration = 650
                    interpolator = DecelerateInterpolator()
                }
                val scale = ScaleAnimation(
                    0.82f, 1f, 0.82f, 1f,
                    Animation.RELATIVE_TO_SELF, 0.5f,
                    Animation.RELATIVE_TO_SELF, 0.5f
                ).apply {
                    duration = 650
                    interpolator = DecelerateInterpolator()
                }
                AnimationSet(true).apply {
                    addAnimation(fade)
                    addAnimation(scale)
                    fillAfter = true
                }.also { view.startAnimation(it) }
            }, delay)
        }

        animateIn(logo, 100)
        animateIn(appName, 500)
        animateIn(credit, 1050)
        splash.postDelayed({
            splash.animate().alpha(0f).setDuration(350).withEndAction {
                root.removeView(splash)
            }.start()
        }, 2600)
    }

    private fun showOffline() {
        val panel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(dp(28), dp(28), dp(28), dp(28))
            setBackgroundColor(Color.WHITE)
        }
        panel.addView(TextView(this).apply {
            text = "ইন্টারনেট সংযোগ পরীক্ষা করুন"
            textSize = 20f
            setTextColor(Color.rgb(16, 27, 85))
            gravity = Gravity.CENTER
        })
        panel.addView(TextView(this).apply {
            text = "EarnStationBD খুলতে সমস্যা হচ্ছে। সংযোগ ঠিক করে আবার চেষ্টা করুন।"
            textSize = 15f
            setTextColor(Color.DKGRAY)
            gravity = Gravity.CENTER
            setPadding(0, dp(12), 0, dp(18))
        })
        panel.addView(Button(this).apply {
            text = "আবার চেষ্টা করুন"
            setOnClickListener { root.removeViewAt(root.childCount - 1); webView.reload() }
        })
        root.addView(panel, FrameLayout.LayoutParams(-1, -1))
    }

    private fun openExternal(uri: Uri) {
        try { startActivity(Intent(Intent.ACTION_VIEW, uri)) } catch (_: Exception) { }
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    override fun onSaveInstanceState(outState: Bundle) {
        webView.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }
}
