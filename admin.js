(() => {
  const client = window.supabase.createClient(
    window.EARNSTATION_SUPABASE_URL,
    window.EARNSTATION_SUPABASE_PUBLISHABLE_KEY
  );
  const status = document.getElementById("admin-auth-status");
  const memberBox = document.getElementById("admin-members");
  const endpoint = window.EARNSTATION_SUPABASE_URL + "/functions/v1/admin-api";

  const escText = (value) => value == null || value === "" ? "—" : String(value);

  async function loadMembers(session) {
    memberBox.innerHTML = "<p>সদস্য তালিকা নিরাপদ API থেকে আনা হচ্ছে...</p>";
    try {
      const response = await fetch(endpoint + "?action=list_members", {
        method: "GET",
        headers: {
          "Authorization": "Bearer " + session.access_token,
          "apikey": window.EARNSTATION_SUPABASE_PUBLISHABLE_KEY
        },
        cache: "no-store"
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        memberBox.innerHTML = "<b>সদস্য তালিকা এখনো চালু হয়নি</b><p>" +
          (response.status === 404
            ? "Supabase-এ admin-api Edge Function এখনো deploy করা হয়নি।"
            : "সার্ভার যাচাই ব্যর্থ হয়েছে। Function deploy ও secret সেটআপ পরীক্ষা করুন।") +
          "</p>";
        return;
      }
      const members = Array.isArray(result.members) ? result.members : [];
      memberBox.replaceChildren();
      const summary = document.createElement("p");
      summary.textContent = "সর্বশেষ " + members.length + " জন সদস্য দেখানো হচ্ছে (সর্বোচ্চ ১০০ জন)।";
      memberBox.appendChild(summary);
      if (!members.length) {
        const empty = document.createElement("p");
        empty.textContent = "এখনো কোনো সদস্যের তথ্য পাওয়া যায়নি।";
        memberBox.appendChild(empty);
        return;
      }
      const list = document.createElement("div");
      list.className = "admin-member-list";
      members.forEach((member) => {
        const card = document.createElement("article");
        card.className = "admin-member-card";
        const name = document.createElement("h3");
        name.textContent = escText(member.full_name);
        const details = document.createElement("p");
        details.textContent = "ফোন: " + escText(member.phone) +
          " · ভূমিকা: " + escText(member.role) +
          " · অবস্থা: " + escText(member.account_status);
        const meta = document.createElement("small");
        meta.textContent = "যোগদান: " + (member.created_at
          ? new Date(member.created_at).toLocaleDateString("bn-BD")
          : "—") + " · রেফারেল কোড: " + escText(member.referral_code);
        card.append(name, details, meta);
        list.appendChild(card);
      });
      memberBox.appendChild(list);
    } catch (_error) {
      memberBox.innerHTML = "<b>সংযোগ করা যায়নি</b><p>নেটওয়ার্ক বা Edge Function deployment পরীক্ষা করুন।</p>";
    }
  }

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
      status.innerHTML = "<b>অ্যাডমিন পরিচয় যাচাই করা যায়নি</b><p>প্রোফাইল যাচাই ব্যর্থ হয়েছে।</p>";
      return;
    }
    if (profile.role !== "admin" || profile.account_status !== "active") {
      status.innerHTML = "<b>অ্যাক্সেস অনুমোদিত নয়</b><p>এই অ্যাকাউন্টের অ্যাডমিন অনুমতি নেই।</p>";
      return;
    }
    status.innerHTML = "<b>অ্যাডমিন পরিচয় যাচাই সফল</b><p>সদস্য তালিকা সার্ভার-সাইড অ্যাডমিন যাচাইয়ের মাধ্যমে পড়া হবে। এখনো কোনো সদস্যের তথ্য পরিবর্তন করা যাবে না।</p>";
    await loadMembers(sessionData.session);
  }

  client.auth.onAuthStateChange((_event, session) => {
    if (!session) window.location.replace("auth.html");
  });
  verifyAdmin();
})();