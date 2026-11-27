(() => {
  const client = window.supabase.createClient(
    window.EARNSTATION_SUPABASE_URL,
    window.EARNSTATION_SUPABASE_PUBLISHABLE_KEY
  );
  const $ = id => document.getElementById(id);
  const panel = $("recovery-panel");
  const link = $("forgot-password-link");
  const form = $("auth-form");
  const start = $("recovery-start");
  const newPasswordPanel = $("recovery-new");
  const action = $("recovery-action");
  const sessionKey = "esbd_recovery_details";
  const query = new URLSearchParams(window.location.search);
  const recoveryCallback = query.has("recover-google");
  let verified = false;
  let checking = false;

  function showRecovery(message = "") {
    form.hidden = true;
    panel.hidden = false;
    link.hidden = true;
    $("auth-message").textContent = message;
  }

  link.addEventListener("click", () => showRecovery());
  $("recovery-cancel").addEventListener("click", async () => {
    sessionStorage.removeItem(sessionKey);
    await client.auth.signOut();
    panel.hidden = true;
    link.hidden = false;
    form.hidden = false;
    $("auth-message").textContent = "";
  });

  async function verifyGoogle(user) {
    if (checking || verified || !recoveryCallback) return;
    checking = true;
    try {
      const details = JSON.parse(sessionStorage.getItem(sessionKey) || "null");
      if (!details?.email || !details?.phone) {
        throw new Error("পুনরুদ্ধারের তথ্য পাওয়া যায়নি। আবার শুরু করুন।");
      }
      const providers = user?.app_metadata?.providers || [];
      if (user?.app_metadata?.provider !== "google" && !providers.includes("google")) {
        throw new Error("Google পরিচয় যাচাই হয়নি। Google দিয়ে আবার চেষ্টা করুন।");
      }
      const googleEmail = String(user?.email || "").trim().toLowerCase();
      if (googleEmail !== details.email) {
        throw new Error("Google Gmail নিবন্ধিত Gmail-এর সঙ্গে মিলছে না।");
      }

      // Query only the currently authenticated user's own profile row.
      const { data: profile, error } = await client
        .from("profiles")
        .select("phone")
        .eq("id", user.id)
        .maybeSingle();
      const savedPhone = String(profile?.phone || "").replace(/\D/g, "");
      if (error || !profile || savedPhone !== details.phone) {
        throw new Error("অ্যাকাউন্টে সংরক্ষিত ফোন নম্বরের সঙ্গে মিল পাওয়া যায়নি।");
      }

      verified = true;
      start.hidden = true;
      newPasswordPanel.hidden = false;
      action.textContent = "নতুন পাসওয়ার্ড সংরক্ষণ";
      $("auth-message").textContent = "Google পরিচয় ও অ্যাকাউন্টের ফোন নম্বর মিলেছে। এখন নতুন পাসওয়ার্ড দিন।";
    } catch (error) {
      sessionStorage.removeItem(sessionKey);
      await client.auth.signOut();
      verified = false;
      start.hidden = false;
      newPasswordPanel.hidden = true;
      action.textContent = "Google দিয়ে যাচাই";
      showRecovery(error.message || "পরিচয় যাচাই করা যায়নি।");
    } finally {
      checking = false;
    }
  }

  action.addEventListener("click", async () => {
    action.disabled = true;
    try {
      if (!verified) {
        const email = $("recovery-email").value.trim().toLowerCase();
        const phone = $("recovery-phone").value.replace(/\D/g, "");
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          throw new Error("সঠিক নিবন্ধিত Gmail লিখুন।");
        }
        if (!/^01[3-9]\d{8}$/.test(phone)) {
          throw new Error("সঠিক ১১ সংখ্যার বাংলাদেশি ফোন নম্বর লিখুন।");
        }
        sessionStorage.setItem(sessionKey, JSON.stringify({ email, phone }));
        const { error } = await client.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: window.location.origin + "/auth.html?recover-google=1",
            queryParams: { prompt: "select_account" }
          }
        });
        if (error) throw error;
      } else {
        const password = $("recovery-password").value;
        const confirm = $("recovery-confirm").value;
        if (password.length < 8) throw new Error("নতুন পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।");
        if (password !== confirm) throw new Error("দুটি নতুন পাসওয়ার্ড মিলছে না।");
        const { error } = await client.auth.updateUser({ password });
        if (error) throw error;
        sessionStorage.removeItem(sessionKey);
        await client.auth.signOut();
        window.location.replace("/auth.html?password-changed=1");
      }
    } catch (error) {
      $("auth-message").textContent = error.message || "পাসওয়ার্ড পুনরুদ্ধার সম্পন্ন হয়নি।";
    } finally {
      action.disabled = false;
    }
  });

  client.auth.onAuthStateChange((event, session) => {
    if (recoveryCallback && session?.user && ["SIGNED_IN", "INITIAL_SESSION"].includes(event)) {
      showRecovery();
      queueMicrotask(() => verifyGoogle(session.user));
    }
  });

  if (recoveryCallback) {
    showRecovery();
    const oauthError = query.get("error_description") || query.get("error");
    if (oauthError) {
      sessionStorage.removeItem(sessionKey);
      $("auth-message").textContent = "Google যাচাই বাতিল হয়েছে বা সম্পন্ন হয়নি। আবার চেষ্টা করুন।";
    }
    client.auth.getSession().then(({ data, error }) => {
      if (error) {
        showRecovery("সেশন যাচাই করা যায়নি। আবার শুরু করুন।");
      } else if (data.session?.user) {
        verifyGoogle(data.session.user);
      } else if (!oauthError) {
        showRecovery("Google যাচাই সম্পন্ন হয়নি। আবার শুরু করুন।");
      }
    });
  }

  if (query.get("password-changed") === "1") {
    $("auth-message").textContent = "পাসওয়ার্ড পরিবর্তন সফল। নতুন পাসওয়ার্ড দিয়ে লগইন করুন।";
  }
})();
