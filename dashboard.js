(() => {
  const client = window.supabase.createClient(window.EARNSTATION_SUPABASE_URL, window.EARNSTATION_SUPABASE_PUBLISHABLE_KEY);
  const $ = (id) => document.getElementById(id);
  const logout = $("logout-button");
  const profileForm = $("profile-form");
  const profileSave = $("profile-save");
  let currentUser = null;
  let currentAvailableBalance = 0;

  function setupSectionNavigation() {
    const main = document.querySelector(".dash-main");
    const sidebarLinks = [...document.querySelectorAll(".dash-sidebar .side-link")];
    const sections = {
      overview: ["welcome-banner", "account-alert", "activity-panel"],
      offers: ["offers"],
      ads: ["ad-center"],
      earnings: [],
      commissions: [],
      withdrawals: ["withdrawals"],
      inbox: ["inbox"],
      profile: ["profile"]
    };
    const views = {};
    Object.keys(sections).forEach(key => {
      const view = document.createElement("section");
      view.className = "dash-view";
      view.dataset.view = key;
      main.appendChild(view);
      views[key] = view;
      sections[key].forEach(id => { const node = $(id); if (node) view.appendChild(node); });
    });
    const stats = $("earnings");
    const cards = stats ? [...stats.querySelectorAll(".stat-card")] : [];
    if (cards[0]) views.earnings.appendChild(cards[0]);
    if (cards[3]) views.earnings.appendChild(cards[3]);
    if (cards[1]) views.commissions.appendChild(cards[1]);
    if (cards[2]) views.withdrawals.insertBefore(cards[2], $("withdrawals"));
    if (stats) stats.remove();
    function activate(key) {
      if (!views[key]) key = "overview";
      Object.entries(views).forEach(([name, view]) => view.classList.toggle("active", name === key));
      sidebarLinks.forEach(link => link.classList.toggle("active", link.getAttribute("href") === "#" + key));
      if (location.hash !== "#" + key) history.replaceState(null, "", "#" + key);
      window.scrollTo({top:0, behavior:"smooth"});
    }
    sidebarLinks.forEach(link => {
      const key = (link.getAttribute("href") || "").slice(1);
      if (views[key]) link.addEventListener("click", event => { event.preventDefault(); activate(key); });
    });
    window.addEventListener("hashchange", () => activate(location.hash.slice(1)));
    activate(views[location.hash.slice(1)] ? location.hash.slice(1) : "overview");
  }

  const money = (value) => "৳ " + Number(value || 0).toLocaleString("en-BD", {minimumFractionDigits:2, maximumFractionDigits:2});
  const dateText = (value) => value ? new Date(value).toLocaleString("bn-BD", {dateStyle:"medium", timeStyle:"short"}) : "তারিখ নেই";
  const safe = (value) => String(value ?? "");
  const statusText = (status) => ({pending:"PENDING · অপেক্ষমাণ",approved:"অনুমোদিত",rejected:"বাতিল",paid:"SUCCESS · পরিশোধিত",refunded:"REFUNDED · টাকা ফেরত"} )[status] || "অজানা";
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

  function renderOffers(offers, error) {
    const root = $("offers-list");
    root.replaceChildren();
    if (error) {
      const empty = document.createElement("div"); empty.className = "empty-state";
      addText(empty,"b","","অফার দেখানো যাচ্ছে না");
      addText(empty,"p","","ডেটাবেস থেকে অফার আনা যায়নি। পরে আবার চেষ্টা করুন।");
      root.appendChild(empty); return;
    }
    if (!offers.length) {
      const empty = document.createElement("div"); empty.className = "empty-state";
      addText(empty,"span","empty-icon","✦");
      addText(empty,"b","","এখনো কোনো সক্রিয় অফার নেই");
      addText(empty,"p","","নতুন অনুমোদিত অফার প্রকাশ হলে এখানে দেখা যাবে।");
      root.appendChild(empty); return;
    }
    offers.forEach(offer => {
      const card = document.createElement("article"); card.className = "offer-card";
      const top = document.createElement("div"); top.className = "offer-card-top";
      addText(top,"span","offer-partner",offer.partner_name);
      addText(top,"span","offer-status","সক্রিয়");
      card.appendChild(top);
      addText(card,"h3","offer-title",offer.title);
      addText(card,"p","offer-description",offer.description || "এই অফারের বিস্তারিত শর্ত পড়ে নিন।");
      if (offer.terms) {
        const details = document.createElement("details"); details.className = "offer-terms";
        addText(details,"summary","","অফারের শর্তাবলি");
        addText(details,"p","",offer.terms);
        card.appendChild(details);
      }
      let destination = null;
      try {
        const parsed = new URL(offer.destination_url);
        if (parsed.protocol === "https:" || parsed.protocol === "http:") destination = parsed.href;
      } catch (_) {}
      if (destination) {
        const link = addText(card,"a","offer-action","পার্টনারের অফার দেখুন ↗");
        link.href = destination; link.target = "_blank"; link.rel = "noopener noreferrer";
      } else {
        const disabled = addText(card,"span","offer-action offer-action-disabled","লিংক প্রস্তুত নয়");
        disabled.setAttribute("aria-disabled","true");
      }
      root.appendChild(card);
    });
  }

  async function loadDashboard(user) {
    currentUser = user;
    $("member-email").textContent = user.email || "সদস্য অ্যাকাউন্ট";
    $("profile-email").value = user.email || "";
    const [profileResult, ledgerResult, conversionResult, withdrawalResult] = await Promise.all([
      client.from("profiles").select("full_name,phone,created_at,role,account_status").eq("id", user.id).maybeSingle(),
      client.from("ledger_entries").select("id,entry_type,amount,description,created_at,is_test").eq("user_id", user.id).order("created_at", {ascending:false}).limit(50),
      client.from("partner_conversions").select("id,partner_name,commission_amount,status,received_at").eq("user_id", user.id).order("received_at", {ascending:false}).limit(50),
      client.from("withdrawal_requests").select("id,amount,payout_method,status,admin_note,created_at,expires_at,paid_at,refunded_at,is_test").eq("user_id", user.id).order("created_at", {ascending:false}).limit(30)
    ]);
    const failed = [profileResult,ledgerResult,conversionResult,withdrawalResult].find(result => result.error);
    if (failed) throw failed.error;

    const profile = profileResult.data;
    if (!profile) throw new Error("আপনার সদস্য প্রোফাইল পাওয়া যায়নি। সহায়তার জন্য প্রশাসকের সঙ্গে যোগাযোগ করুন।");
    if (profile.account_status === "suspended") { await client.auth.signOut(); window.location.replace("auth.html?suspended=1"); throw new Error("এই অ্যাকাউন্টটি সাময়িকভাবে স্থগিত।"); }
    $("profile-name").value = profile.full_name || "";
    $("profile-phone").value = profile.phone || "";
    const adminLink = $("admin-nav-link");
    if (adminLink) adminLink.hidden = profile.role !== "admin";
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
    currentAvailableBalance = Math.max(0, credits - debits - reserved);
    $("available-balance").textContent = money(currentAvailableBalance);
    $("withdraw-form-balance").textContent = money(currentAvailableBalance);
    $("pending-count").textContent = pending.length.toLocaleString("bn-BD");
    $("pending-commission").textContent = pending.length ? pending.length.toLocaleString("bn-BD") + "টি কনভার্সন যাচাই হচ্ছে" : "নতুন অপেক্ষমাণ কমিশন নেই";

    const alert = $("account-alert");
    alert.querySelector("b").textContent = "অ্যাকাউন্ট সংযুক্ত";
    alert.querySelector("p").textContent = "আপনার প্রোফাইল ও আর্থিক তথ্য ডেটাবেস থেকে লোড হয়েছে।";
    alert.className = "setup-alert";
    alert.querySelector(".alert-check").textContent = "✓";

    renderActivity(ledger, conversions, withdrawals);
    renderWithdrawals(withdrawals);
    renderInbox(withdrawals);
    const offerResult = await client.from("offers").select("id,title,description,partner_name,destination_url,terms,created_at").eq("status","active").order("created_at",{ascending:false}).limit(30);
    renderOffers(offerResult.data || [], offerResult.error);
  }

  function renderActivity(ledger, conversions, withdrawals) {
    const items = [
      ...ledger.map(item => ({date:item.created_at, title:item.description || "লেনদেন", detail:item.is_test ? "পরীক্ষামূলক জমা (বাস্তব অর্থ নয়)" : (item.entry_type === "credit" ? "জমা" : "সমন্বয়/কর্তন"), amount:(item.entry_type === "credit" ? "+" : "−") + money(item.amount), positive:item.entry_type === "credit"})),
      ...conversions.map(item => ({date:item.received_at, title:"পার্টনার কনভার্সন", detail:safe(item.partner_name) + " · " + statusText(item.status), amount:money(item.commission_amount), positive:item.status === "approved"})),
      ...withdrawals.map(item => ({date:item.created_at, title:item.is_test ? "পরীক্ষামূলক উত্তোলনের অনুরোধ" : "উত্তোলনের অনুরোধ", detail:(item.payout_method === "bkash" ? "বিকাশ" : "নগদ") + " · " + statusText(item.status), amount:"−" + money(item.amount), positive:false}))
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
      addText(row,"strong",item.positive ? "activity-amount positive" : "activity-amount",item.amount);
      row.appendChild(info); root.appendChild(row);
    });
  }

  function renderWithdrawals(withdrawals) {
    const root = $("withdrawal-list"); root.replaceChildren();
    if (!withdrawals.length) { addText(root,"p","muted-message","এখনো কোনো উত্তোলনের অনুরোধ নেই।"); return; }
    withdrawals.forEach(item => {
      const row = document.createElement("div"); row.className="data-row";
      const info = document.createElement("div"); info.className="data-row-info";
      addText(info,"b","", (item.is_test ? "TEST · পরীক্ষামূলক · " : "") + (item.payout_method === "bkash" ? "বিকাশ" : "নগদ") + " · " + statusText(item.status));
      addText(info,"small","",dateText(item.created_at));
      if (item.is_test) addText(info,"small","","পরীক্ষামূলক অনুরোধ—বাস্তব পেমেন্ট নয়। ৫ ঘণ্টা পরে স্বয়ংক্রিয় ফেরত হবে।");
      if (item.admin_note) addText(info,"small","", "প্রশাসকের নোট: " + item.admin_note);
      row.appendChild(info); addText(row,"strong","",money(item.amount)); root.appendChild(row);
    });
  }

  function renderInbox(withdrawals) {
    const root = $("inbox-list");
    if (!root) return;
    root.replaceChildren();
    if (!withdrawals.length) {
      addText(root,"p","muted-message","এখনো কোনো পেমেন্ট বা উইথড্রের হিসাব নেই।");
      return;
    }
    withdrawals.forEach(item => {
      const row = document.createElement("div"); row.className = "data-row";
      const info = document.createElement("div"); info.className = "data-row-info";
      addText(info,"b","", (item.is_test ? "TEST · পরীক্ষামূলক · " : "") + (item.payout_method === "bkash" ? "বিকাশ" : "নগদ") + " · " + statusText(item.status));
      addText(info,"small","", "অনুরোধ: " + dateText(item.created_at));
      if (item.is_test) addText(info,"small","","পরীক্ষামূলক অনুরোধ—বাস্তব পেমেন্ট নয়।");
      if (item.status === "pending" || item.status === "approved") addText(info,"small","","পেমেন্টের শেষ সময়: " + dateText(item.expires_at));
      if (item.paid_at) addText(info,"small","","পেমেন্ট সম্পন্ন: " + dateText(item.paid_at));
      if (item.refunded_at) addText(info,"small","","টাকা ফেরত: " + dateText(item.refunded_at));
      if (item.admin_note) addText(info,"small","", "প্রশাসকের নোট: " + item.admin_note);
      row.appendChild(info);
      addText(row,"strong","",money(item.amount));
      root.appendChild(row);
    });
  }

  profileForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!currentUser) return;
    const fullName = $("profile-name").value.trim();
    const phone = $("profile-phone").value.trim();
    if (!fullName) return setMessage("আপনার পূর্ণ নাম লিখুন।","error");
    const normalizedPhone = phone.replace(/\D/g, "");
    if (!/^01[3-9][0-9]{8}$/.test(normalizedPhone)) return setMessage("সঠিক ১১ সংখ্যার বাংলাদেশি মোবাইল নম্বর লিখুন।","error");
    profileSave.disabled = true; profileSave.textContent = "সংরক্ষণ হচ্ছে..."; setMessage("");
    try {
      const {error} = await client.from("profiles").update({full_name:fullName, phone:normalizedPhone}).eq("id",currentUser.id);
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

  const withdrawForm = $("withdraw-form");
  const withdrawMessage = (text,type="") => { $("withdraw-message").textContent=text; $("withdraw-message").className="withdraw-message "+type; };
  withdrawForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const method=$("withdraw-method").value;
    const account=$("withdraw-account").value.replace(/[^0-9]/g,"");
    const amount=Number($("withdraw-amount").value);
    if(!method) return withdrawMessage("বিকাশ অথবা নগদ অ্যাকাউন্টের ধরন নির্বাচন করুন।","error");
    if(!/^01[3-9][0-9]{8}$/.test(account)) return withdrawMessage("সঠিক ১১ সংখ্যার বাংলাদেশি মোবাইল নম্বর লিখুন।","error");
    if(!Number.isFinite(amount)||amount<=0) return withdrawMessage("সঠিক উত্তোলনের পরিমাণ লিখুন।","error");
    if(amount>currentAvailableBalance) return withdrawMessage("সঠিক ব্যালেন্স লিখুন। আপনার উত্তোলনযোগ্য ব্যালেন্স "+money(currentAvailableBalance)+"।","error");
    const {data:{session}} = await client.auth.getSession();
    if(!session) return withdrawMessage("সেশন শেষ হয়েছে। আবার লগইন করুন।","error");
    const submit=$("withdraw-submit");
    submit.disabled=true; submit.textContent="অনুরোধ পাঠানো হচ্ছে...";
    withdrawMessage("");
    try {
      const response=await fetch("http://127.0.0.1:3001/api/withdrawal",{
        method:"POST",
        headers:{"Content-Type":"application/json","Authorization":"Bearer "+session.access_token},
        body:JSON.stringify({method,account,amount})
      });
      const result=await response.json();
      if(!response.ok) throw new Error(result.error || "উত্তোলনের অনুরোধ পাঠানো যায়নি।");
      withdrawMessage(result.message || "উত্তোলনের অনুরোধ জমা হয়েছে।","success");
      withdrawForm.reset();
      await loadDashboard(currentUser);
    } catch(error) {
      withdrawMessage(error.message || "নিরাপদ সার্ভারে সংযোগ করা যায়নি।","error");
    } finally {
      submit.disabled=false; submit.textContent="উত্তোলনের অনুরোধ করুন";
    }
  });

  logout.addEventListener("click", async () => {
    logout.disabled = true;
    const {error} = await client.auth.signOut();
    if (error) { alert("লগআউট হয়নি: " + error.message); logout.disabled = false; }
    else window.location.replace("auth.html");
  });

  setupSectionNavigation();

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