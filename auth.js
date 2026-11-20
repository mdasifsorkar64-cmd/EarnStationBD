(() => {
  const client = window.supabase.createClient(window.EARNSTATION_SUPABASE_URL, window.EARNSTATION_SUPABASE_PUBLISHABLE_KEY);
  const form = document.getElementById("auth-form");
  const email = document.getElementById("email");
  const password = document.getElementById("password");
  const message = document.getElementById("auth-message");
  const submit = document.getElementById("submit-button");
  const loginTab = document.getElementById("show-login");
  const signupTab = document.getElementById("show-signup");
  let mode = "login";
  function setMode(next) {
    mode = next;
    loginTab.classList.toggle("active", mode === "login");
    signupTab.classList.toggle("active", mode === "signup");
    submit.textContent = mode === "login" ? "লগইন করুন" : "অ্যাকাউন্ট তৈরি করুন";
    password.autocomplete = mode === "login" ? "current-password" : "new-password";
    message.textContent = "";
    message.className = "auth-message";
  }
  loginTab.addEventListener("click", () => setMode("login"));
  signupTab.addEventListener("click", () => setMode("signup"));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    message.textContent = "অপেক্ষা করুন...";
    message.className = "auth-message";
    submit.disabled = true;
    try {
      const credentials = { email: email.value.trim(), password: password.value };
      if (mode === "signup") {
        const { data, error } = await client.auth.signUp({
          ...credentials,
          options: { emailRedirectTo: window.location.origin + "/dashboard.html" }
        });
        if (error) throw error;
        if (data.session) {
          message.textContent = "অ্যাকাউন্ট তৈরি হয়েছে। ড্যাশবোর্ডে নেওয়া হচ্ছে...";
          message.classList.add("success");
          window.location.href = "dashboard.html";
        } else {
          message.textContent = "নিবন্ধন অনুরোধ সফল। আপনার ইমেইলে যাচাইকরণ লিংক পাঠানো হয়েছে—ইমেইল যাচাই করে তারপর লগইন করুন।";
          message.classList.add("success");
          form.reset();
        }
      } else {
        const { error } = await client.auth.signInWithPassword(credentials);
        if (error) throw error;
        message.textContent = "লগইন সফল।";
        message.classList.add("success");
        window.location.href = "dashboard.html";
      }
    } catch (error) {
      message.textContent = error.message || "কাজটি সম্পন্ন হয়নি। আবার চেষ্টা করুন।";
      message.classList.add("error");
    } finally {
      submit.disabled = false;
    }
  });
  client.auth.getSession().then(({ data }) => {
    if (data.session) window.location.href = "dashboard.html";
  });
})();