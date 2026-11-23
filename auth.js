(() => {
  const client = window.supabase.createClient(
    window.EARNSTATION_SUPABASE_URL,
    window.EARNSTATION_SUPABASE_PUBLISHABLE_KEY
  );
  const form = document.getElementById("auth-form");
  const email = document.getElementById("email");
  const password = document.getElementById("password");
  const fullName = document.getElementById("full-name");
  const phone = document.getElementById("phone");
  const referralCode = document.getElementById("referral-code");
  const signupFields = document.getElementById("signup-fields");
  const message = document.getElementById("auth-message");
  const submit = document.getElementById("submit-button");
  const loginTab = document.getElementById("show-login");
  const signupTab = document.getElementById("show-signup");
  let mode = "login";

  function setMode(next) {
    mode = next;
    const isSignup = mode === "signup";
    loginTab.classList.toggle("active", !isSignup);
    signupTab.classList.toggle("active", isSignup);
    signupFields.hidden = !isSignup;
    [fullName, phone, referralCode].forEach((field) => {
      field.disabled = !isSignup;
    });
    fullName.required = isSignup;
    phone.required = isSignup;
    submit.textContent = isSignup ? "অ্যাকাউন্ট তৈরি করুন" : "লগইন করুন";
    password.autocomplete = isSignup ? "new-password" : "current-password";
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
      const credentials = {
        email: email.value.trim(),
        password: password.value
      };

      if (mode === "signup") {
        const cleanPhone = phone.value.replace(/\D/g, "");
        if (!/^01[3-9][0-9]{8}$/.test(cleanPhone)) {
          throw new Error("সঠিক ১১ সংখ্যার বাংলাদেশি মোবাইল নম্বর দিন।");
        }
        const { data, error } = await client.auth.signUp({
          ...credentials,
          options: {
            data: {
              full_name: fullName.value.trim(),
              phone: cleanPhone,
              referral_code: referralCode.value.trim().toUpperCase()
            },
            emailRedirectTo: new URL("dashboard.html", window.location.href).href
          }
        });
        if (error) throw error;

        if (data.session) {
          message.textContent = "অ্যাকাউন্ট তৈরি হয়েছে। ড্যাশবোর্ডে নেওয়া হচ্ছে...";
          message.classList.add("success");
          window.location.href = new URL("dashboard.html", window.location.href).href;
        } else {
          message.textContent = "নিবন্ধন সফল হয়েছে। আপনার ইমেইলে যাচাইকরণ লিংক পাঠানো হয়েছে। ইমেইল যাচাই করে তারপর লগইন করুন।";
          message.classList.add("success");
          form.reset();
          setMode("login");
        }
      } else {
        const { error } = await client.auth.signInWithPassword(credentials);
        if (error) throw error;
        message.textContent = "লগইন সফল।";
        message.classList.add("success");
        window.location.href = new URL("dashboard.html", window.location.href).href;
      }
    } catch (error) {
      const errorText = String(error.message || "");
      if (mode === "signup" && /Database error saving new user/i.test(errorText)) {
        message.textContent = "এই মোবাইল নম্বরটি আগে থেকেই একটি অ্যাকাউন্টে যুক্ত আছে। নতুন অ্যাকাউন্ট না খুলে লগইন ট্যাবে গিয়ে আপনার বিদ্যমান অ্যাকাউন্টে প্রবেশ করুন। আপনার অ্যাডমিন অ্যাকাউন্ট নিরাপদ আছে—এটি মুছবেন না।";
      } else {
        message.textContent = error.message || "কাজটি সম্পন্ন হয়নি। আবার চেষ্টা করুন।";
      }
      message.classList.add("error");
    } finally {
      submit.disabled = false;
    }
  });

  client.auth.getSession().then(({ data }) => {
    if (data.session) {
      window.location.href = new URL("dashboard.html", window.location.href).href;
    }
  });

  setMode("login");
})();
