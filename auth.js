(() => {
  const client = window.supabase.createClient(window.EARNSTATION_SUPABASE_URL, window.EARNSTATION_SUPABASE_PUBLISHABLE_KEY);
  const form = document.getElementById("auth-form");
  const email = document.getElementById("email");
  const password = document.getElementById("password");
  const confirmPassword = document.getElementById("confirm-password");
  const fullName = document.getElementById("full-name");
  const phone = document.getElementById("phone");
  const referralCode = document.getElementById("referral-code");
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

  function setMessage(text, type = "") {
    message.textContent = text;
    message.className = "auth-message" + (type ? " " + type : "");
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
    fullName.required = signup;
    confirmPassword.required = signup;
    loginOptions.hidden = signup;
    recoveryLink.hidden = signup;
    title.textContent = signup ? "নিবন্ধন করুন" : "লগইন করুন";
    subtitle.textContent = signup ? "নতুন অ্যাকাউন্ট তৈরি করুন" : "আপনার অ্যাকাউন্টে প্রবেশ করুন";
    submit.querySelector("span").textContent = signup ? "নিবন্ধন করুন" : "লগইন করুন";
    password.autocomplete = signup ? "new-password" : "current-password";
    authSwitch.hidden = signup;
    setMessage("");
  }
  loginTab.addEventListener("click", () => setMode("login"));
  signupTab.addEventListener("click", () => setMode("signup"));
  document.getElementById("switch-to-signup").addEventListener("click", () => setMode("signup"));

  const recoveryPanel = document.getElementById("recovery-panel");
  const recoveryLink = document.getElementById("show-recovery");
  const recoveryMessage = document.getElementById("recovery-message");
  let recoveryEmail = "";
  let recoveryPhone = "";
  let recoveryVerified = false;
  const recoverySay = (text, type = "") => {
    recoveryMessage.textContent = text;
    recoveryMessage.className = "auth-message" + (type ? " " + type : "");
  };
  function showLoginForm() {
    recoveryPanel.hidden = true;
    form.hidden = false;
    document.querySelector(".auth-tabs").hidden = false;
    authSwitch.hidden = mode === "signup";
    recoveryLink.hidden = mode === "signup";
    title.textContent = mode === "signup" ? "নিবন্ধন করুন" : "লগইন করুন";
    subtitle.textContent = mode === "signup" ? "নতুন অ্যাকাউন্ট তৈরি করুন" : "আপনার অ্যাকাউন্টে প্রবেশ করুন";
    setMessage("");
  }
  recoveryLink.addEventListener("click", () => {
    if (mode !== "login") return;
    form.hidden = true;
    document.querySelector(".auth-tabs").hidden = true;
    authSwitch.hidden = true;
    recoveryLink.hidden = true;
    recoveryPanel.hidden = false;
    title.textContent = "পাসওয়ার্ড পুনরুদ্ধার";
    subtitle.textContent = "ইমেইল OTP দিয়ে পরিচয় যাচাই করুন";
    recoverySay("");
  });
  document.getElementById("recovery-back").addEventListener("click", showLoginForm);
  document.getElementById("recovery-send").addEventListener("click", async () => {
    recoveryEmail = document.getElementById("recovery-email").value.trim().toLowerCase();
    recoveryPhone = document.getElementById("recovery-phone").value.replace(/\D/g, "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recoveryEmail)) return recoverySay("সঠিক নিবন্ধিত ইমেইল লিখুন।", "error");
    if (!/^01[3-9][0-9]{8}$/.test(recoveryPhone)) return recoverySay("সঠিক ১১ সংখ্যার মোবাইল নম্বর লিখুন।", "error");
    const button = document.getElementById("recovery-send");
    button.disabled = true;
    try {
      const { error } = await client.auth.resetPasswordForEmail(recoveryEmail, { redirectTo: window.location.origin + "/auth.html" });
      if (error) throw error;
      document.getElementById("recovery-otp-area").hidden = false;
      recoverySay("আপনার ইমেইলে ৬ সংখ্যার OTP পাঠানো হয়েছে। ইনবক্স ও স্প্যাম ফোল্ডার দেখুন।", "success");
    } catch (error) {
      recoverySay(error.message || "OTP পাঠানো যায়নি।", "error");
    } finally {
      button.disabled = false;
    }
  });
  document.getElementById("recovery-verify").addEventListener("click", async () => {
    const token = document.getElementById("recovery-otp").value.trim();
    if (!/^\d{6}$/.test(token)) return recoverySay("ইমেইলে পাওয়া ৬ সংখ্যার OTP লিখুন।", "error");
    const button = document.getElementById("recovery-verify");
    button.disabled = true;
    try {
      const { data, error } = await client.auth.verifyOtp({ email: recoveryEmail, token, type: "recovery" });
      if (error) throw error;
      const user = data.user || data.session?.user;
      if (!user || user.email?.toLowerCase() !== recoveryEmail) throw new Error("OTP যাচাই করা যায়নি। আবার চেষ্টা করুন।");
      const { data: profile, error: profileError } = await client.from("profiles").select("phone").eq("id", user.id).maybeSingle();
      const savedPhone = String(profile?.phone || "").replace(/\D/g, "");
      if (profileError || !profile || savedPhone !== recoveryPhone) throw new Error("ফোন নম্বরটি এই অ্যাকাউন্টের সংরক্ষিত নম্বরের সঙ্গে মিলছে না।");
      recoveryVerified = true;
      document.getElementById("recovery-password-area").hidden = false;
      recoverySay("ইমেইল OTP ও সংরক্ষিত ফোন নম্বর মিলেছে। এখন নতুন পাসওয়ার্ড দিন।", "success");
    } catch (error) {
      recoverySay(error.message || "OTP যাচাই করা যায়নি।", "error");
    } finally {
      button.disabled = false;
    }
  });
  document.getElementById("recovery-save").addEventListener("click", async () => {
    if (!recoveryVerified) return recoverySay("আগে ইমেইলের OTP যাচাই করুন।", "error");
    const nextPassword = document.getElementById("recovery-new-password").value;
    const confirm = document.getElementById("recovery-confirm-password").value;
    if (nextPassword.length < 8) return recoverySay("নতুন পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।", "error");
    if (nextPassword !== confirm) return recoverySay("দুটি পাসওয়ার্ড মিলছে না।", "error");
    const button = document.getElementById("recovery-save");
    button.disabled = true;
    try {
      const { error } = await client.auth.updateUser({ password: nextPassword });
      if (error) throw error;
      await client.auth.signOut();
      recoveryVerified = false;
      recoveryEmail = "";
      recoveryPhone = "";
      document.getElementById("recovery-email").value = "";
      document.getElementById("recovery-phone").value = "";
      document.getElementById("recovery-otp").value = "";
      document.getElementById("recovery-new-password").value = "";
      document.getElementById("recovery-confirm-password").value = "";
      document.getElementById("recovery-otp-area").hidden = true;
      document.getElementById("recovery-password-area").hidden = true;
      showLoginForm();
      setMessage("পাসওয়ার্ড সফলভাবে পরিবর্তন হয়েছে। নতুন পাসওয়ার্ড দিয়ে লগইন করুন।", "success");
    } catch (error) {
      recoverySay(error.message || "পাসওয়ার্ড পরিবর্তন করা যায়নি।", "error");
    } finally {
      button.disabled = false;
    }
  });

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
    if (mode === "signup") {
      if (password.value.length < 8) return setMessage("পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।", "error");
      if (password.value !== confirmPassword.value) return setMessage("পাসওয়ার্ড এবং কনফার্ম পাসওয়ার্ড মিলছে না।", "error");
      if (!fullName.value.trim()) return setMessage("আপনার পূর্ণ নাম লিখুন।", "error");
      const normalizedPhone = phone.value.replace(/\D/g, "");
      if (!/^01[3-9][0-9]{8}$/.test(normalizedPhone)) return setMessage("সঠিক ১১ সংখ্যার বাংলাদেশি মোবাইল নম্বর লিখুন।", "error");
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
      setMessage(error.message || "কাজটি সম্পন্ন হয়নি। আবার চেষ্টা করুন।", "error");
    } finally {
      submit.disabled = false;
    }
  });
  client.auth.getSession().then(({ data }) => {
    if (data.session) window.location.href = "dashboard.html";
  });
})();