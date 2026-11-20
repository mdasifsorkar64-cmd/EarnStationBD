(() => {
  const client = window.supabase.createClient(window.EARNSTATION_SUPABASE_URL, window.EARNSTATION_SUPABASE_PUBLISHABLE_KEY);
  const $ = (id) => document.getElementById(id);
  const logout = $("logout-button");
  const profileForm = $("profile-form");
  const profileSave = $("profile-save");
  let currentUser = null;

  const money = (value) => "৳ " + Number(value || 0).toLocaleString("en-BD", {minimumFractionDigits:2, maximumFractionDigits:2});
  const dateText = (value) => value ? new Date(value).toLocaleString("bn-BD", {dateStyle:"medium", timeStyle:"short"}) : "তারিখ নেই";
  const safe = (value) => String(value ?? "");
  const statusText = (status) => ({pending:"অপেক্ষমাণ",approved:"অনুমোদিত",rejected:"বাতিল",paid:"পরিশোধিত"})[status] || "অজানা";
  const setMessage = (message, type="") => { $("profile-message").textContent = message; $("profile-message").className = "profile-message " + type; };
  const showError = (message) => {
    const alert = $("account-alert");
    alert.className = "setup-alert setup-alert-error";
    alert.querySelector("b").textContent = "তথ্য লোড করা যায়নি";
    alert.querySelector("p").textContent = message;
    alert.querySelector(".alert-check").textContent = "!";
  };
  const addText = (parent, tag, className, value) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = safe(value);
    parent.appendChild(node);
    return node;
  };

  async function loadDashboard(user) {
    currentUser = user;
    $("member-email").textContent = user.email || "সদস্য অ্যাকাউন্ট";
    $("profile-email").value = user.email || "";
    const [profileResult, ledgerResult, conversionResult, withdrawalResult] = await Promise.all([
      client.from("profiles").select("full_name,phone,created_at").eq("id", user.id).maybeSingle(),
      client.from("ledger_entries").select("id,entry_type,amount,description,created_at").eq("user_id", user.id).order("created_at", {ascending:false}).limit(50),
      client.from("partner_conversions").select("id,partner_name,commission_amount,status,received_at").eq("user_id", user.id).order("received_at", {ascending:false}).limit(50),
      client.from("withdrawal_requests").select("id,amount,payout_method,status,admin_note,created_at").eq("user_id", user.id).order("created_at", {ascending:false}).limit(30)
    ]);
    const failed = [profileResult,ledgerResult,conversionResult,withdrawalResult].find(result => result.error);
    if (failed) throw failed.error;

    const profile = profileResult.data;
    if (!profile) throw new Error("আপনার সদস্য প্রোফাইল পাওয়া যায়নি। সহায়তার জন্য প্রশাসকের সঙ্গে যোগাযোগ করুন।");
    $("profile-name").value = profile.full_name || "";
    $("profile-phone").value = profile.phone || "";
    const displayName = profile.full_name || "সদস্য";
    $("welcome-title").textContent = "স্বাগতম, " + displayName + "!";
    $("profile-avatar").textContent = [...displayName][0] || "আ";

    const ledger = ledgerResult.data || [];
    const conversions = conversionResult.data || [];
    const withdrawals = withdrawalResult.data || [];
    const credits = ledger.filter(item => item.entry_type === "credit").reduce((sum,item) => sum + Number(item.amount),0);
    const debits = ledger.filter(item => item.entry_type !== "credit").reduce((sum,item) => sum + Number(item.amount),0);
    const reserved = withdrawals.filter(item => ["pending","approved","paid"].includes(item.status)).reduce((sum,item) => sum + Number(item.amount),0);
    const approved = conversions.filter(item => item.status === "approved").reduce((sum,item) => sum + Number(item.commission_amount),0);
    const pending = conversions.filter(item => item.status === "pending");
    $("total-earned").textContent = money(credits);
    $("approved-commission").textContent = money(approved);
    $("available-balance").textContent = money(Math.max(0, credits - debits - reserved));
    $("pending-count").textContent = pending.length.toLocaleString("bn-BD");
    $("pending-commission").textContent = pending.length ? pending.length.toLocaleString("bn-BD") + "টি কনভার্সন যাচাই হচ্ছে" : "নতুন অপেক্ষমাণ কমিশন নেই";

    const alert = $("account-alert");
    alert.querySelector("b").textContent = "অ্যাকাউন্ট সংযুক্ত";
    alert.querySelector("p").textContent = "আপনার প্রোফাইল ও আর্থিক তথ্য ডেটাবেস থেকে লোড হয়েছে।";
    alert.className = "setup-alert";
    alert.querySelector(".alert-check").textContent = "✓";

    renderActivity(ledger, conversions, withdrawals);
    renderWithdrawals(withdrawals);
  }

  function renderActivity(ledger, conversions, withdrawals) {
    const items = [
      ...ledger.map(item => ({date:item.created_at, title:item.description || "লেনদেন", detail:item.entry_type === "credit" ? "জমা" : "সমন্বয়/কর্তন", amount:(item.entry_type === "credit" ? "+" : "−") + money(item.amount), positive:item.entry_type === "credit"})),
      ...conversions.map(item => ({date:item.received_at, title:"পার্টনার কনভার্সন", detail:safe(item.partner_name) + " · " + statusText(item.status), amount:money(item.commission_amount), positive:item.status === "approved"})),
      ...withdrawals.map(item => ({date:item.created_at, title:"উত্তোলনের অনুরোধ", detail:(item.payout_method === "bkash" ? "বিকাশ" : "নগদ") + " · " + statusText(item.status), amount:"−" + money(item.amount), positive:false}))
    ].sort((a,b) => new Date(b.date || 0) - new Date(a.date || 0)).slice(0,10);
    const root = $("activity-list");
    root.replaceChildren();
    if (!items.length) {
      const empty = document.createElement("div"); empty.className="empty-state";
      addText(empty,"span","empty-icon","◷"); addText(empty,"b","","এখনো কোনো কার্যক্রম নেই");
      addText(empty,"p","","যাচাইকৃত কার্যক্রম শুরু হলে এখানে দেখা যাবে।"); root.appendChild(empty); return;
    }
    items.forEach(item => {
      const row = document.createElement("div"); row.className="activity-row";
      const info = document.createElement("div"); info.className="activity-info";
      addText(info,"b","",item.title); addText(info,"span","",item.detail); addText(info,"small","",dateText(item.date));
      const amount = addText(row,"strong",item.positive ? "activity-amount positive" : "activity-amount",item.amount);
      row.appendChild(info); root.appendChild(row);
    });
  }

  function renderWithdrawals(withdrawals) {
    const root = $("withdrawal-list"); root.replaceChildren();
    if (!withdrawals.length) { addText(root,"p","muted-message","এখনো কোনো উত্তোলনের অনুরোধ নেই।"); return; }
    withdrawals.forEach(item => {
      const row = document.createElement("div"); row.className="data-row";
      const info = document.createElement("div"); info.className="data-row-info";
      addText(info,"b","", (item.payout_method === "bkash" ? "বিকাশ" : "নগদ") + " · " + statusText(item.status));
      addText(info,"small","",dateText(item.created_at));
      if (item.admin_note) addText(info,"small","", "প্রশাসকের নোট: " + item.admin_note);
      row.appendChild(info); addText(row,"strong","",money(item.amount)); root.appendChild(row);
    });
  }

  profileForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!currentUser) return;
    const fullName = $("profile-name").value.trim();
    const phone = $("profile-phone").value.trim();
    if (!fullName) return setMessage("আপনার পূর্ণ নাম লিখুন।","error");
    profileSave.disabled = true; profileSave.textContent = "সংরক্ষণ হচ্ছে..."; setMessage("");
    try {
      const {error} = await client.from("profiles").update({full_name:fullName, phone:phone || null}).eq("id",currentUser.id);
      if (error) throw error;
      $("welcome-title").textContent = "স্বাগতম, " + fullName + "!";
      $("profile-avatar").textContent = [...fullName][0] || "আ";
      setMessage("প্রোফাইল সফলভাবে আপডেট হয়েছে।","success");
    } catch (error) {
      setMessage(error.message || "প্রোফাইল আপডেট করা যায়নি।","error");
    } finally {
      profileSave.disabled = false; profileSave.textContent = "পরিবর্তন সংরক্ষণ করুন";
    }
  });

  logout.addEventListener("click", async () => {
    logout.disabled = true;
    const {error} = await client.auth.signOut();
    if (error) { alert("লগআউট হয়নি: " + error.message); logout.disabled = false; }
    else window.location.replace("auth.html");
  });

  client.auth.onAuthStateChange((_event, session) => {
    if (!session) window.location.replace("auth.html");
  });
  (async () => {
    const {data,error} = await client.auth.getSession();
    if (error || !data.session) { window.location.replace("auth.html"); return; }
    try { await loadDashboard(data.session.user); }
    catch (error) { showError(error.message || "আবার চেষ্টা করুন।"); }
  })();
})();