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
      setMessage(window.EarnStationErrors.toBengali(error, "কাজটি সম্পন্ন হয়নি। আবার চেষ্টা করুন।"), "error");
    } finally {
      submit.disabled = false;
    }
  });
  client.auth.getSession().then(({ data }) => {
    if (data.session) window.location.href = "dashboard.html";
  });
})();