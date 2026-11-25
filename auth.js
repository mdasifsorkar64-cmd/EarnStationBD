(() => {
  const client = window.supabase.createClient(window.EARNSTATION_SUPABASE_URL, window.EARNSTATION_SUPABASE_PUBLISHABLE_KEY);
  const form = document.getElementById("auth-form");
  const email = document.getElementById("email");
  const password = document.getElementById("password");
  const confirmPassword = document.getElementById("confirm-password");
  const fullName = document.getElementById("full-name");
  const phone = document.getElementById("phone");
  const referralCode = document.getElementById("referral-code");
  const termsAccepted = document.getElementById("terms-accepted");
  const termsGroup = document.getElementById("terms-group");
  const referralGroup = document.getElementById("referral-group");
  const referralFromLink = new URLSearchParams(window.location.search).get("ref") || "";
  const message = document.getElementById("auth-message");
  const submit = document.getElementById("submit-button");
  const loginTab = document.getElementById("show-login");
  const signupTab = document.getElementById("show-signup");
  const title = document.getElementById("auth-title");
  const subtitle = document.getElementById("auth-subtitle");
  const loginOptions = document.getElementById("login-options");
  const authSwitch = document.getElementById("auth-switch");
  let mode = "login";
  const recoveryPanel = document.getElementById("recovery-panel");
  const recoveryLink = document.getElementById("forgot-password-link");
  const recoverySubmit = document.getElementById("recovery-submit");
  let recoveryStage = "request";
  let recoveryUser = null;
  // Supabase may return a PKCE callback as ?code=... rather than a #type=recovery hash.
  // Keep the recovery route from being mistaken for an ordinary signed-in visit.
  let recoveryFlowDetected = false;
  const recoveryQuery = new URLSearchParams(window.location.search);
  const recoveryHash = new URLSearchParams(window.location.hash.slice(1));
  const hasRecoveryCallback =
    recoveryQuery.has("code") ||
    recoveryHash.get("type") === "recovery" ||
    recoveryHash.get("type") === "magiclink";

  function setMessage(text, type = "") {
    message.textContent = text;
    message.className = "auth-message" + (type ? " " + type : "");
  }

  // Convert Supabase Auth / Postgres errors into clear Bengali messages.
  function friendlyAuthError(error) {
    const raw = [error?.message, error?.details, error?.hint, error?.code].filter(Boolean).join(" ").toLowerCase();
    const code = String(error?.code || error?.status || "");

    if (/invalid login credentials|invalid email or password/.test(raw)) {
      return "আপনার ইমেইল অথবা পাসওয়ার্ড সঠিক নয়। আবার পরীক্ষা করুন।";
    }
    if (/email not confirmed/.test(raw)) {
      return "আপনার ইমেইল এখনো যাচাই করা হয়নি। ইমেইলের যাচাইকরণ লিংকে চাপ দিন।";
    }
    if (/user already registered|already been registered|already registered/.test(raw)) {
      return "এই ইমেইল দিয়ে আগে থেকেই একটি অ্যাকাউন্ট রয়েছে। লগইন করুন অথবা পাসওয়ার্ড রিসেট করুন।";
    }
    if (/profiles_phone_key|duplicate key.*phone|phone number.*(already|registered)|user with this phone.*exists/.test(raw)) {
      return "এই মোবাইল নম্বরটি আগে থেকেই একটি অ্যাকাউন্টে যুক্ত আছে। আগে নিবন্ধন করে থাকলে লগইন করুন। পুরোনো অ্যাকাউন্টে প্রবেশ করতে না পারলে অ্যাডমিনের সহায়তা নিন। নম্বরটি ভুল হলে সঠিক নম্বর দিন।";
    }
    if (/invalid email|email address.*invalid/.test(raw)) {
      return "আপনার ইমেইল ঠিকানাটি সঠিক নয়। আবার লিখুন।";
    }
    if (/password.*(at least|too short|characters)|weak password/.test(raw)) {
      return "পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের এবং নিরাপদ হতে হবে।";
    }
    if (/same password|password.*match/.test(raw)) {
      return "দুটি পাসওয়ার্ড মিলছে না। একই পাসওয়ার্ড লিখুন।";
    }
    if (/rate limit|too many requests/.test(raw) || code === "429") {
      return "অনেকবার চেষ্টা করা হয়েছে। কিছুক্ষণ অপেক্ষা করে আবার চেষ্টা করুন।";
    }
    if (/network|failed to fetch|fetch error/.test(raw)) {
      return "ইন্টারনেট সংযোগে সমস্যা হয়েছে। সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।";
    }
    if (/23505/.test(raw) || code === "23505") {
      return "এই তথ্যটি আগে থেকেই ব্যবহৃত হয়েছে। মোবাইল নম্বর ও ইমেইল পরীক্ষা করুন।";
    }
    if (/23503|foreign key/.test(raw)) {
      return "অ্যাকাউন্টের তথ্য সংরক্ষণে সম্পর্কিত ডেটার সমস্যা হয়েছে। সহায়তার জন্য অ্যাডমিনকে জানান।";
    }
    if (/23502|not-null/.test(raw)) {
      return "কিছু প্রয়োজনীয় তথ্য পাওয়া যায়নি। ফর্মের সব আবশ্যিক ঘর পূরণ করুন।";
    }
    if (/42501|permission denied|row-level security/.test(raw)) {
      return "এই কাজের অনুমতি পাওয়া যায়নি। অ্যাডমিনকে সমস্যাটি জানান।";
    }
    if (/database error saving new user|error saving new user|database error/.test(raw)) {
      return "আপনার অ্যাকাউন্টের তথ্য ডেটাবেজে সংরক্ষণ করা যায়নি। আপনার ইমেইল ও মোবাইল নম্বর আগে ব্যবহৃত হয়েছে কি না পরীক্ষা করুন। সমস্যা থাকলে অ্যাডমিনকে জানান।";
    }
    return "দুঃখিত, কাজটি সম্পন্ন হয়নি। আপনার তথ্য পরীক্ষা করে আবার চেষ্টা করুন। সমস্যা চলতে থাকলে অ্যাডমিনকে জানান।";
  }
  function setMode(next) {
    mode = next;
    const signup = mode === "signup";
    loginTab.classList.toggle("active", !signup);
    signupTab.classList.toggle("active", signup);
    loginTab.setAttribute("aria-selected", String(!signup));
    signupTab.setAttribute("aria-selected", String(signup));
    document.getElementById("name-group").hidden = !signup;
    document.getElementById("phone-group").hidden = !signup;
    if (referralGroup) referralGroup.hidden = !signup;
    if (signup && referralCode && referralFromLink && !referralCode.value) referralCode.value = referralFromLink.toUpperCase().slice(0,10);
    phone.required = signup;
    document.getElementById("confirm-group").hidden = !signup;
    if (termsGroup) termsGroup.hidden = !signup;
    if (termsAccepted) termsAccepted.required = signup;
    fullName.required = signup;
    confirmPassword.required = signup;
    loginOptions.hidden = signup;
    title.textContent = signup ? "নিবন্ধন করুন" : "লগইন করুন";
    subtitle.textContent = signup ? "নতুন অ্যাকাউন্ট তৈরি করুন" : "আপনার অ্যাকাউন্টে প্রবেশ করুন";
    submit.querySelector("span").textContent = signup ? "নিবন্ধন করুন" : "লগইন করুন";
    password.autocomplete = signup ? "new-password" : "current-password";
    authSwitch.hidden = signup;
    setMessage("");
  }
  function showRecovery(stage) {
    recoveryStage = stage;
    form.hidden = true;
    document.querySelector(".auth-tabs").hidden = true;
    authSwitch.hidden = true;
    recoveryLink.hidden = true;
    recoveryPanel.hidden = false;
    document.getElementById("recovery-email-group").hidden = stage !== "request";
    document.getElementById("recovery-phone-group").hidden = stage !== "verify";
    document.getElementById("new-password-group").hidden = stage !== "verify";
    document.getElementById("new-password-confirm-group").hidden = stage !== "verify";
    document.getElementById("recovery-title").textContent = stage === "request" ? "পাসওয়ার্ড পুনরুদ্ধার" : "নতুন পাসওয়ার্ড সেট করুন";
    document.getElementById("recovery-help").textContent = stage === "request"
      ? "নিবন্ধিত ইমেইল দিন। ইমেইলে নিরাপদ রিসেট লিংক পাঠানো হবে।"
      : "ইমেইলের লিংকে প্রবেশের পর আপনার নিবন্ধিত মোবাইল নম্বর মিলিয়ে নতুন পাসওয়ার্ড দিন।";
    recoverySubmit.textContent = stage === "request" ? "ইমেইলে রিসেট লিংক পাঠান" : "নতুন পাসওয়ার্ড সংরক্ষণ করুন";
    setMessage("");
  }
  function hideRecovery() {
    recoveryPanel.hidden = true;
    form.hidden = false;
    document.querySelector(".auth-tabs").hidden = false;
    recoveryLink.hidden = false;
    setMode("login");
  }
  recoveryLink.addEventListener("click", () => showRecovery("request"));
  document.getElementById("recovery-cancel").addEventListener("click", hideRecovery);
  recoverySubmit.addEventListener("click", async () => {
    recoverySubmit.disabled = true;
    try {
      if (recoveryStage === "request") {
        const recoveryEmail = document.getElementById("recovery-email").value.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recoveryEmail)) throw new Error("সঠিক ইমেইল ঠিকানা লিখুন।");
        const { error } = await client.auth.resetPasswordForEmail(recoveryEmail, {
          redirectTo: window.location.origin + "/auth.html"
        });
        if (error) throw error;
        setMessage("যদি এই ইমেইলে অ্যাকাউন্ট থাকে, তাহলে পাসওয়ার্ড রিসেটের নির্দেশনা পাঠানো হয়েছে। ইনবক্স ও স্প্যাম ফোল্ডার দেখুন।", "success");
      } else {
        const phoneValue = document.getElementById("recovery-phone").value.trim().replace(/[\s-]/g, "");
        if (!/^01[3-9][0-9]{8}$/.test(phoneValue)) throw new Error("সঠিক ১১ সংখ্যার মোবাইল নম্বর লিখুন।");
        const { data: profile, error: profileError } = await client.from("profiles").select("phone").eq("id", recoveryUser.id).single();
        if (profileError || !profile || String(profile.phone || "").replace(/[\s-]/g, "") !== phoneValue) throw new Error("ইমেইল ও নিবন্ধিত মোবাইল নম্বরের মিল পাওয়া যায়নি।");
        const newPassword = document.getElementById("new-password").value;
        const confirmNew = document.getElementById("new-password-confirm").value;
        if (newPassword.length < 8) throw new Error("নতুন পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।");
        if (newPassword !== confirmNew) throw new Error("দুটি নতুন পাসওয়ার্ড মিলছে না।");
        const { error } = await client.auth.updateUser({ password: newPassword });
        if (error) throw error;
        await client.auth.signOut();
        recoveryPanel.hidden = true;
        form.hidden = false;
        document.querySelector(".auth-tabs").hidden = false;
        recoveryLink.hidden = false;
        setMode("login");
        setMessage("পাসওয়ার্ড সফলভাবে পরিবর্তন হয়েছে। এখন নতুন পাসওয়ার্ড দিয়ে লগইন করুন।", "success");
      }
    } catch (error) {
      setMessage(error.message || "অনুরোধটি সম্পন্ন হয়নি। আবার চেষ্টা করুন।", "error");
    } finally {
      recoverySubmit.disabled = false;
    }
  });
  client.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY" && session?.user) {
      recoveryFlowDetected = true;
      recoveryUser = session.user;
      showRecovery("verify");
    }
  });
  client.auth.getSession().then(({ data, error }) => {
    if (error) {
      setMessage("সেশন যাচাই করা যায়নি। রিসেট লিংকটি নতুন করে খুলুন।", "error");
      return;
    }

    // The recovery callback can be a PKCE ?code=... URL. Do not send a
    // recovery session to dashboard.html just because the URL has no hash.
    if (data.session && (recoveryFlowDetected || hasRecoveryCallback)) {
      recoveryUser = data.session.user;
      showRecovery("verify");
    } else if (data.session && !hasRecoveryCallback) {
      window.location.href = "dashboard.html";
    }
    // If a PKCE code is still being exchanged, wait for PASSWORD_RECOVERY.
  });
  loginTab.addEventListener("click", () => setMode("login"));
  signupTab.addEventListener("click", () => setMode("signup"));
  document.getElementById("switch-to-signup").addEventListener("click", () => setMode("signup"));

  document.querySelectorAll(".password-toggle").forEach(button => {
    button.addEventListener("click", () => {
      const field = document.getElementById(button.dataset.toggle);
      const show = field.type === "password";
      field.type = show ? "text" : "password";
      button.classList.toggle("is-visible", show);
      button.setAttribute("aria-label", show ? "পাসওয়ার্ড লুকান" : "পাসওয়ার্ড দেখান");
    });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const normalizedEmail = email.value.trim();
    if (!normalizedEmail) return setMessage("আপনার ইমেইল ঠিকানা লিখুন।", "error");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return setMessage("সঠিক ইমেইল ঠিকানা লিখুন। উদাহরণ: name@example.com", "error");
    if (!password.value) return setMessage("আপনার পাসওয়ার্ড লিখুন।", "error");

    const normalizedPhone = phone.value.trim().replace(/[\s-]/g, "");
    if (mode === "signup") {
      if (password.value.length < 8) return setMessage("পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।", "error");
      if (password.value !== confirmPassword.value) return setMessage("পাসওয়ার্ড এবং কনফার্ম পাসওয়ার্ড মিলছে না।", "error");
      if (!fullName.value.trim()) return setMessage("আপনার পূর্ণ নাম লিখুন।", "error");
      if (!termsAccepted?.checked) return setMessage("নিবন্ধনের আগে ব্যবহারের শর্তাবলি ও গোপনীয়তা নীতিতে সম্মতি দিন।", "error");
      if (!/^01[3-9][0-9]{8}$/.test(normalizedPhone)) return setMessage("সঠিক ১১ সংখ্যার বাংলাদেশি মোবাইল নম্বর লিখুন (শুধু সংখ্যা, স্পেস বা হাইফেন)।", "error");
    }
    setMessage("অপেক্ষা করুন...");
    submit.disabled = true;
    try {
      const credentials = { email: email.value.trim(), password: password.value };
      if (mode === "signup") {
        const { data, error } = await client.auth.signUp({
          ...credentials,
          options: {
            data: { full_name: fullName.value.trim(), phone: phone.value.replace(/\D/g, ""), referral_code: (referralCode?.value || "").trim().toUpperCase() },
            emailRedirectTo: window.location.origin + "/dashboard.html"
          }
        });
        if (error) throw error;
        if (data.session) {
          setMessage("অ্যাকাউন্ট তৈরি হয়েছে। ড্যাশবোর্ডে নেওয়া হচ্ছে...", "success");
          window.location.href = "dashboard.html";
        } else {
          setMessage("নিবন্ধন সফল! আপনার ইমেইলে যাচাইকরণ লিংক পাঠানো হয়েছে। ইমেইল যাচাই করে লগইন করুন।", "success");
          form.reset();
          setMode("login");
        }
      } else {
        const { error } = await client.auth.signInWithPassword(credentials);
        if (error) throw error;
        setMessage("লগইন সফল।", "success");
        window.location.href = "dashboard.html";
      }
    } catch (error) {
      setMessage(friendlyAuthError(error), "error");
    } finally {
      submit.disabled = false;
    }
  });
})();