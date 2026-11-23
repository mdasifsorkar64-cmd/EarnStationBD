(() => {
  const client = window.supabase.createClient(
    window.EARNSTATION_SUPABASE_URL,
    window.EARNSTATION_SUPABASE_PUBLISHABLE_KEY
  );
  const status = document.getElementById("admin-auth-status");

  async function verifyAdmin() {
    status.innerHTML = "<b>অ্যাডমিন পরিচয় যাচাই হচ্ছে...</b><p>অ্যাকাউন্টের ভূমিকা পরীক্ষা করা হচ্ছে।</p>";
    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError || !sessionData.session) {
      window.location.replace("auth.html");
      return;
    }

    const userId = sessionData.session.user.id;
    const { data: profile, error } = await client
      .from("profiles")
      .select("role, account_status")
      .eq("id", userId)
      .maybeSingle();

    if (error || !profile) {
      status.innerHTML = "<b>অ্যাডমিন পরিচয় যাচাই করা যায়নি</b><p>প্রোফাইল যাচাই ব্যর্থ হয়েছে। নিরাপত্তার জন্য অ্যাডমিন অংশ বন্ধ রাখা হয়েছে।</p>";
      return;
    }
    if (profile.role !== "admin" || profile.account_status !== "active") {
      status.innerHTML = "<b>অ্যাক্সেস অনুমোদিত নয়</b><p>এই অ্যাকাউন্টের অ্যাডমিন অনুমতি নেই।</p>";
      return;
    }
    status.innerHTML = "<b>অ্যাডমিন পরিচয় যাচাই সফল</b><p>আপনার সক্রিয় অ্যাডমিন ভূমিকা Supabase প্রোফাইল থেকে নিশ্চিত হয়েছে। ডেটা পরিচালনা এখনো নিরাপত্তার জন্য বন্ধ।</p>";
  }

  client.auth.onAuthStateChange((_event, session) => {
    if (!session) window.location.replace("auth.html");
  });
  verifyAdmin();
})();