(() => {
  const client = window.supabase.createClient(window.EARNSTATION_SUPABASE_URL, window.EARNSTATION_SUPABASE_PUBLISHABLE_KEY);
  const $ = (id) => document.getElementById(id);
  const logout = $("logout-button");
  const profileForm = $("profile-form");
  const profileSave = $("profile-save");
  let currentUser = null;
  let profileLocked = false;
  let currentAvailableBalance = 0;
  let latestWithdrawals = [];

  function setupSectionNavigation() {
    const main = document.querySelector(".dash-main");
    const sidebarLinks = [...document.querySelectorAll(".dash-sidebar .side-link")];
    const sections = {
      overview: ["welcome-banner", "member-notice", "daily-progress", "account-alert", "activity-panel"],
      offers: ["offers"],
      ads: ["ad-center"],
      earnings: [],
      commissions: [],
      withdrawals: ["withdrawals"],
      inbox: ["inbox"],
      profile: ["profile"],
      referrals: ["referral-info"],
      help: ["help-center"]
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
    const quickRoutes = ["earnings", "commissions", "withdrawals", "earnings"];
    cards.forEach((card, index) => {
      const target = quickRoutes[index];
      if (!target) return;
      card.setAttribute("role", "button");
      card.setAttribute("tabindex", "0");
      card.setAttribute("aria-label", card.querySelector("small")?.textContent + " বিস্তারিত দেখুন");
      const openTarget = () => activate(target);
      card.addEventListener("click", openTarget);
      card.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openTarget(); }
      });
    });
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

  async function loadReferralInfo() {
    const {data,error}=await client.rpc("get_my_referral_summary");
    if(error)throw error;
    const info=Array.isArray(data)?data[0]:data;
    if(!info)throw new Error("রেফারেল তথ্য পাওয়া যায়নি।");
    const code=String(info.referral_code||"");
    $("my-referral-code").textContent=code||"কোড তৈরি হয়নি";
    $("referral-count").textContent=Number(info.successful_referrals||0).toLocaleString("bn-BD");
    $("referral-total").textContent=money(info.total_bonus);
    $("referral-current-bonus").textContent=money(info.current_bonus);
    const inviteUrl=new URL("auth.html",window.location.href);inviteUrl.searchParams.set("ref",code);const link=inviteUrl.href;
    const copy=async value=>{try{await navigator.clipboard.writeText(value);$("referral-message").textContent="কপি হয়েছে।";}catch(_){$("referral-message").textContent=value;}};
    $("copy-referral-code").onclick=()=>copy(code);
    $("share-referral-link").onclick=async()=>{
      const shareData={title:"EarnStationBD-এ যোগ দিন",text:"আমার আমন্ত্রণ লিংক দিয়ে EarnStationBD-এ যোগ দিন। আমন্ত্রণ কোড: "+code,url:link};
      try {
        if(navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
          await navigator.share(shareData);
          $("referral-message").textContent="আমন্ত্রণ লিংক শেয়ার করা হয়েছে।";
        } else {
          await copy(link);
          $("referral-message").textContent="এই ফোনে শেয়ার অপশন নেই, তাই লিংক কপি হয়েছে।";
        }
      } catch(error) {
        if(error.name!=="AbortError") {
          try { await copy(link); $("referral-message").textContent="শেয়ার করা যায়নি, লিংক কপি হয়েছে।"; }
          catch(_) { $("referral-message").textContent=link; }
        }
      }
    };
  }


  // Update member presence while the dashboard tab is visible.
  let presenceTimer = null;
  async function sendPresenceHeartbeat() {
    if (!currentUser || document.visibilityState !== "visible") return;
    const { error } = await client.rpc("member_presence_heartbeat");
    if (error) console.warn("Presence heartbeat:", window.EarnStationErrors.toBengali(error));
  }
  function startPresenceHeartbeat() {
    if (presenceTimer) clearInterval(presenceTimer);
    sendPresenceHeartbeat();
    presenceTimer = setInterval(sendPresenceHeartbeat, 30000);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") sendPresenceHeartbeat();
    });
  }

  async function loadDashboard(user) {
    currentUser = user;
    startPresenceHeartbeat();
    try { await client.rpc("claim_referral_bonus"); } catch (e) { console.warn("Referral bonus check:", window.EarnStationErrors.toBengali(e)); }
    $("member-email").textContent = user.email || "সদস্য অ্যাকাউন্ট";
    $("profile-email").value = user.email || "";
    const refreshButton = $("dashboard-refresh");
    if (refreshButton) { refreshButton.disabled = true; refreshButton.classList.add("is-loading"); }
    const [profileResult, ledgerResult, conversionResult, withdrawalResult, financialResult] = await Promise.all([
      client.from("profiles").select("full_name,phone,created_at,role,account_status").eq("id", user.id).maybeSingle(),
      client.from("ledger_entries").select("id,entry_type,amount,description,created_at,is_test,withdrawal_id").eq("user_id", user.id).order("created_at", {ascending:false}).limit(50),
      client.from("partner_conversions").select("id,partner_name,commission_amount,status,received_at").eq("user_id", user.id).order("received_at", {ascending:false}).limit(50),
      client.from("withdrawal_requests").select("id,amount,payout_method,status,admin_note,created_at,expires_at,paid_at,refunded_at,is_test").eq("user_id", user.id).order("created_at", {ascending:false}).limit(30),
      client.rpc("get_my_financial_summary")
    ]);
    const failed = [profileResult,ledgerResult,conversionResult,withdrawalResult,financialResult].find(result => result.error);
    if (failed) throw failed.error;

    const profile = profileResult.data;
    if (!profile) throw new Error("আপনার সদস্য প্রোফাইল পাওয়া যায়নি। সহায়তার জন্য প্রশাসকের সঙ্গে যোগাযোগ করুন।");
    if (profile.account_status === "suspended") { await client.auth.signOut(); window.location.replace("auth.html?suspended=1"); throw new Error("এই অ্যাকাউন্টটি সাময়িকভাবে স্থগিত।"); }
    $("profile-name").value = profile.full_name || "";
    $("profile-phone").value = profile.phone || "";
    profileLocked = profile.account_status === "active" || profile.role !== "member";
    $("profile-name").disabled = profileLocked;
    $("profile-phone").disabled = profileLocked;
    profileSave.hidden = profileLocked;
    if (profileLocked) setMessage("অ্যাকাউন্ট সক্রিয় হওয়ার পর নাম, ফোন নম্বরসহ কোনো প্রোফাইল তথ্য পরিবর্তন করা যাবে না।", "");
    const adminLink = $("admin-nav-link");
    if (adminLink) adminLink.hidden = profile.role !== "admin";
    const displayName = profile.full_name || "সদস্য";
    $("welcome-title").textContent = "স্বাগতম, " + displayName + "!";
    $("profile-avatar").textContent = [...displayName][0] || "আ";

    const ledger = ledgerResult.data || [];
    const conversions = conversionResult.data || [];
    const withdrawals = withdrawalResult.data || [];
    latestWithdrawals = withdrawals;
    const financial = Array.isArray(financialResult.data) ? financialResult.data[0] : financialResult.data;
    if (!financial) throw new Error("আপনার আয়ের হিসাব পাওয়া যায়নি। Supabase-এ financial_accounting_fix.sql চালানো হয়েছে কি না যাচাই করুন।");
    const approved = conversions.filter(item => item.status === "approved").reduce((sum,item) => sum + Number(item.commission_amount),0);
    const pending = conversions.filter(item => item.status === "pending");
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    const todayResult = await client.from("partner_conversions").select("id,status,received_at").eq("user_id",user.id).gte("received_at",todayStart.toISOString()).order("received_at",{ascending:false}).limit(500);
    const todayConversions = todayResult.error ? conversions.filter(item => item.received_at && new Date(item.received_at) >= todayStart) : (todayResult.data || []);
    $("today-conversions").textContent = (todayResult.error ? todayConversions.length.toLocaleString("bn-BD") + "+" : todayConversions.length.toLocaleString("bn-BD"));
    $("today-approved").textContent = todayConversions.filter(item => item.status === "approved").length.toLocaleString("bn-BD");
    $("today-pending").textContent = todayConversions.filter(item => item.status === "pending").length.toLocaleString("bn-BD");
    $("daily-progress-date").textContent = new Date().toLocaleDateString("bn-BD",{day:"numeric",month:"short"});
    const siteResult = await client.rpc("public_get_site_settings");
    const site = !siteResult.error && Array.isArray(siteResult.data) ? siteResult.data[0] : null;
    const notice = $("member-notice");
    const noticeText = site?.announcement?.trim() || "";
    notice.hidden = !noticeText;
    if (noticeText) $("member-notice-text").textContent = noticeText;
    const supportLink = $("support-email-link");
    if (site?.contact_email) { supportLink.href = "mailto:" + site.contact_email + "?subject=" + encodeURIComponent("EarnStationBD সহায়তা"); supportLink.textContent = "ইমেইল করুন: " + site.contact_email; supportLink.classList.remove("offer-action-disabled"); supportLink.removeAttribute("aria-disabled"); }
    else { supportLink.textContent = "যোগাযোগের ইমেইল এখনো যোগ করা হয়নি"; supportLink.setAttribute("aria-disabled","true"); }
    $("total-earned").textContent = money(financial.total_earned);
    $("approved-commission").textContent = money(approved);
    currentAvailableBalance = Number(financial.available_balance || 0);
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
    await loadReferralInfo();
    renderWithdrawals(withdrawals);
    const inboxResult = await client.from("member_inbox")
      .select("id,notification_type,title,message,amount,created_at,read_at")
      .eq("user_id", user.id)
      .order("created_at", {ascending:false})
      .limit(100);
    renderInbox(inboxResult.data || [], withdrawals, inboxResult.error);
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

  function renderInbox(notifications, withdrawals, inboxError) {
    const root = $("inbox-list");
    if (!root) return;
    root.replaceChildren();

    let unread = notifications.filter(item => !item.read_at).length;
    const count = $("inbox-unread-count");
    if (count) {
      count.hidden = unread === 0;
      count.textContent = unread.toLocaleString("bn-BD");
    }

    if (inboxError) {
      addText(root,"p","muted-message","আয়ের ইনবক্স এখনো প্রস্তুত নয়। ডেটাবেসে member_inbox.sql চালানো হয়েছে কি না যাচাই করুন।");
    } else if (!notifications.length) {
      addText(root,"p","muted-message","এখনো কোনো প্রকৃত আয়ের নোটিফিকেশন নেই। নতুন আয় হলে এখানে আলাদা রেকর্ড দেখা যাবে।");
    } else {
      notifications.forEach(item => {
        const row = document.createElement("div");
        row.className = "data-row income-inbox-row" + (item.read_at ? "" : " inbox-unread");
        const info = document.createElement("div");
        info.className = "data-row-info";
        addText(info,"b","",item.title);
        addText(info,"small","",item.message);
        addText(info,"small","",dateText(item.created_at));
        row.appendChild(info);
        const right = document.createElement("div");
        right.className = "inbox-row-actions";
        addText(right,"strong","activity-amount positive","+" + money(item.amount));
        if (!item.read_at) {
          const readButton = addText(right,"button","inbox-read-button","পড়েছি");
          readButton.type = "button";
          readButton.addEventListener("click", async () => {
            readButton.disabled = true;
            const {error} = await client.rpc("mark_my_inbox_item_read",{p_inbox_id:item.id});
            if (error) {
              readButton.disabled = false;
              alert(window.EarnStationErrors.toBengali(error));
              return;
            }
            item.read_at = new Date().toISOString();
            row.classList.remove("inbox-unread");
            readButton.remove();
            unread = Math.max(0, unread - 1);
            if (count) {
              count.hidden = unread === 0;
              count.textContent = unread.toLocaleString("bn-BD");
            }
          });
        }
        row.appendChild(right);
        root.appendChild(row);
      });
    }

    const paymentHeading = document.createElement("h3");
    paymentHeading.className = "inbox-subheading";
    paymentHeading.textContent = "উত্তোলন ও পেমেন্টের আপডেট";
    root.appendChild(paymentHeading);
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
    if (profileLocked) return setMessage("অ্যাকাউন্ট সক্রিয় হওয়ার পর প্রোফাইল তথ্য পরিবর্তন করা যাবে না।", "error");
    const fullName = $("profile-name").value.trim();
    const phone = $("profile-phone").value.trim();
    if (!fullName) return setMessage("আপনার পূর্ণ নাম লিখুন।","error");
    const normalizedPhone = phone.replace(/\\D/g, "");
    if (!/^01[3-9][0-9]{8}$/.test(normalizedPhone)) return setMessage("সঠিক ১১ সংখ্যার বাংলাদেশি মোবাইল নম্বর লিখুন।","error");
    profileSave.disabled = true; profileSave.textContent = "সংরক্ষণ হচ্ছে..."; setMessage("");
    try {
      const {error} = await client.rpc("update_my_profile",{p_full_name:fullName,p_phone:normalizedPhone});
      if (error) throw error;
      $("welcome-title").textContent = "স্বাগতম, " + fullName + "!";
      $("profile-avatar").textContent = [...fullName][0] || "আ";
      setMessage("প্রোফাইল সফলভাবে আপডেট হয়েছে।","success");
    } catch (error) {
      setMessage(window.EarnStationErrors.toBengali(error, "প্রোফাইল আপডেট করা যায়নি।"),"error");
    } finally {
      profileSave.disabled = false; profileSave.textContent = "পরিবর্তন সংরক্ষণ করুন";
    }
  });

  const passwordChangeForm = $("password-change-form");
  passwordChangeForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const currentPassword = $("current-password").value;
    const newPassword = $("new-password").value;
    const confirmPassword = $("confirm-new-password").value;
    const message = $("password-change-message");
    const button = $("password-change-submit");
    const showPasswordMessage = (value, type="") => { message.textContent = value; message.className = "profile-message " + type; };
    if (!currentUser?.email) return showPasswordMessage("অ্যাকাউন্টের ইমেইল পাওয়া যায়নি। আবার লগইন করুন।", "error");
    if (!currentPassword) return showPasswordMessage("বর্তমান পাসওয়ার্ড লিখুন।", "error");
    if (newPassword.length < 8) return showPasswordMessage("নতুন পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।", "error");
    if (newPassword !== confirmPassword) return showPasswordMessage("নতুন পাসওয়ার্ড দুটি মিলছে না।", "error");
    if (currentPassword === newPassword) return showPasswordMessage("নতুন পাসওয়ার্ডটি বর্তমান পাসওয়ার্ড থেকে আলাদা হতে হবে।", "error");
    button.disabled = true; button.textContent = "যাচাই হচ্ছে..."; showPasswordMessage("");
    try {
      const { error: verifyError } = await client.auth.signInWithPassword({ email: currentUser.email, password: currentPassword });
      if (verifyError) throw new Error("বর্তমান পাসওয়ার্ড সঠিক নয়। আবার পরীক্ষা করুন।");
      button.textContent = "সংরক্ষণ হচ্ছে...";
      const { error: updateError } = await client.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;
      passwordChangeForm.reset();
      showPasswordMessage("পাসওয়ার্ড সফলভাবে পরিবর্তন হয়েছে। নতুন পাসওয়ার্ড দিয়ে পরবর্তী লগইন করতে পারবেন।", "success");
    } catch (error) {
      showPasswordMessage(window.EarnStationErrors.toBengali(error, "পাসওয়ার্ড পরিবর্তন করা যায়নি। আবার চেষ্টা করুন।"), "error");
    } finally {
      button.disabled = false; button.textContent = "পাসওয়ার্ড পরিবর্তন করুন";
    }
  });

  const recoveryToggle = $("forgot-current-password");
  const recoveryPanel = $("profile-recovery-panel");
  const recoveryMessage = $("profile-recovery-message");
  let recoveryStage = "request";
  let recoveryVerified = false;
  const recoverySay = (value, type="") => { recoveryMessage.textContent = value; recoveryMessage.className = "profile-message " + type; };
  recoveryToggle.addEventListener("click", () => {
    recoveryPanel.hidden = !recoveryPanel.hidden;
    $("profile-recovery-email").value = currentUser?.email || "";
    $("profile-recovery-phone").value = $("profile-phone").value || "";
    recoverySay("");
  });
  $("profile-recovery-send").addEventListener("click", async () => {
    const email = $("profile-recovery-email").value.trim().toLowerCase();
    const phone = $("profile-recovery-phone").value.replace(/\\D/g, "");
    if (!currentUser?.email || email !== currentUser.email.toLowerCase()) return recoverySay("লগইন করা অ্যাকাউন্টের নিবন্ধিত ইমেইল ব্যবহার করুন।", "error");
    if (!/^01[3-9][0-9]{8}$/.test(phone)) return recoverySay("সঠিক ১১ সংখ্যার ফোন নম্বর লিখুন।", "error");
    const button = $("profile-recovery-send"); button.disabled = true;
    try {
      sessionStorage.setItem("esbd_profile_recovery_phone", phone);
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + "/dashboard.html" });
      if (error) throw error;
      recoveryStage = "otp"; $("profile-recovery-otp-area").hidden = false;
      recoverySay("আপনার ইমেইলে ৬ সংখ্যার OTP পাঠানো হয়েছে। ইনবক্স ও স্প্যাম ফোল্ডার দেখুন।", "success");
    } catch (error) { recoverySay(window.EarnStationErrors.toBengali(error, "OTP পাঠানো যায়নি।"), "error"); }
    finally { button.disabled = false; }
  });
  $("profile-recovery-verify").addEventListener("click", async () => {
    const token = $("profile-recovery-otp").value.trim();
    if (!/^\\d{6}$/.test(token)) return recoverySay("ইমেইলে পাওয়া ৬ সংখ্যার OTP লিখুন।", "error");
    const button = $("profile-recovery-verify"); button.disabled = true;
    try {
      const { data, error } = await client.auth.verifyOtp({ email: currentUser.email, token, type: "recovery" });
      if (error) throw error;
      const user = data.user || data.session?.user;
      if (!user || user.id !== currentUser.id) throw new Error("OTP অন্য অ্যাকাউন্টের জন্য।");
      const { data: profile, error: profileError } = await client.from("profiles").select("phone").eq("id", user.id).maybeSingle();
      const savedPhone = String(profile?.phone || "").replace(/\\D/g, "");
      const enteredPhone = sessionStorage.getItem("esbd_profile_recovery_phone") || "";
      if (profileError || !profile || savedPhone !== enteredPhone) throw new Error("ফোন নম্বরটি এই অ্যাকাউন্টের সংরক্ষিত নম্বরের সঙ্গে মিলছে না।");
      recoveryVerified = true;
      $("profile-recovery-password-area").hidden = false;
      recoverySay("ইমেইল OTP ও সংরক্ষিত ফোন নম্বর মিলেছে। নতুন পাসওয়ার্ড দিন।", "success");
    } catch (error) { recoverySay(window.EarnStationErrors.toBengali(error, "OTP যাচাই করা যায়নি।"), "error"); }
    finally { button.disabled = false; }
  });
  $("profile-recovery-save").addEventListener("click", async () => {
    if (!recoveryVerified) return recoverySay("আগে ইমেইলের OTP যাচাই করুন।", "error");
    const password = $("profile-recovery-new-password").value;
    const confirm = $("profile-recovery-confirm-password").value;
    if (password.length < 8) return recoverySay("নতুন পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।", "error");
    if (password !== confirm) return recoverySay("দুটি পাসওয়ার্ড মিলছে না।", "error");
    const button = $("profile-recovery-save"); button.disabled = true;
    try {
      const { error } = await client.auth.updateUser({ password });
      if (error) throw error;
      sessionStorage.removeItem("esbd_profile_recovery_phone");
      $("password-change-form").reset();
      $("profile-recovery-new-password").value = "";
      $("profile-recovery-confirm-password").value = "";
      recoveryVerified = false;
      recoverySay("পাসওয়ার্ড সফলভাবে পরিবর্তন হয়েছে। আপনার অ্যাকাউন্ট লগইন অবস্থায় আছে।", "success");
    } catch (error) { recoverySay(window.EarnStationErrors.toBengali(error, "নতুন পাসওয়ার্ড সংরক্ষণ করা যায়নি।"), "error"); }
    finally { button.disabled = false; }
  });

  const passwordSecurityToggle = $("password-security-toggle");
  const passwordSecurityContent = $("password-security-content");
  passwordSecurityToggle.addEventListener("click", () => {
    const isOpening = passwordSecurityContent.hidden;
    passwordSecurityContent.hidden = !isOpening;
    passwordSecurityToggle.setAttribute("aria-expanded", String(isOpening));
    $("password-security-toggle-label").textContent = isOpening ? "বন্ধ করুন" : "খুলুন";
  });

  document.querySelectorAll(".password-visibility-toggle").forEach((toggle) => {
    toggle.addEventListener("click", () => {
      const field = $(toggle.dataset.target);
      const show = field.type === "password";
      field.type = show ? "text" : "password";
      toggle.textContent = show ? "লুকান" : "দেখান";
      toggle.setAttribute("aria-pressed", String(show));
    });
  });

  const withdrawForm = $("withdraw-form");
  const withdrawMessage = (text,type="") => { $("withdraw-message").textContent=text; $("withdraw-message").className="withdraw-message "+type; };
  withdrawForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const method=$("withdraw-method").value;
    const account=$("withdraw-account").value.replace(/[^0-9]/g,"");
    const amount=Number($("withdraw-amount").value);

    // Bangladesh local time: withdrawals allowed 08:00–19:59, one request per local day.
    const bdParts = new Intl.DateTimeFormat("en-GB", {
      timeZone:"Asia/Dhaka", year:"numeric", month:"2-digit", day:"2-digit",
      hour:"2-digit", minute:"2-digit", hourCycle:"h23"
    }).formatToParts(new Date());
    const bd = Object.fromEntries(bdParts.map(part => [part.type, part.value]));
    const bdDate = bd.year + "-" + bd.month + "-" + bd.day;
    const bdMinutes = Number(bd.hour) * 60 + Number(bd.minute);
    if (bdMinutes < 480 || bdMinutes >= 1200)
      return withdrawMessage("উইথড্র করার সময় সকাল ৮টা থেকে রাত ৮টা পর্যন্ত। এই সময়ের বাইরে উত্তোলন করা যাবে না।","error");
    const alreadyToday = latestWithdrawals.some(item => {
      const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone:"Asia/Dhaka", year:"numeric", month:"2-digit", day:"2-digit"
      }).formatToParts(new Date(item.created_at));
      const date = Object.fromEntries(parts.map(part => [part.type, part.value]));
      return date.year + "-" + date.month + "-" + date.day === bdDate;
    });
    if (alreadyToday)
      return withdrawMessage("আপনি আজ একবার উইথড্র করেছেন। দিনে মাত্র ১ বার উইথড্র করা যাবে। আগামীকাল সকাল ৮টার পর আবার চেষ্টা করুন।","error");
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
      withdrawMessage(window.EarnStationErrors.toBengali(error, "নিরাপদ সার্ভারে সংযোগ করা যায়নি।"),"error");
    } finally {
      submit.disabled=false; submit.textContent="উত্তোলনের অনুরোধ করুন";
    }
  });

  logout.addEventListener("click", async () => {
    logout.disabled = true;
    const {error} = await client.auth.signOut();
    if (error) { alert(window.EarnStationErrors.toBengali(error)); logout.disabled = false; }
    else window.location.replace("auth.html");
  });

  setupSectionNavigation();
  const refreshDashboard = $("dashboard-refresh");
  if (refreshDashboard) refreshDashboard.addEventListener("click", async () => {
    if (!currentUser) return;
    refreshDashboard.disabled = true; refreshDashboard.classList.add("is-loading");
    try { await loadDashboard(currentUser); }
    catch (error) { showError(window.EarnStationErrors.toBengali(error, "তথ্য রিফ্রেশ করা যায়নি।")); }
    finally { refreshDashboard.disabled = false; refreshDashboard.classList.remove("is-loading"); }
  });

  client.auth.onAuthStateChange((_event, session) => {
    if (!session) window.location.replace("auth.html");
  });
  (async () => {
    const {data,error} = await client.auth.getSession();
    if (error || !data.session) { window.location.replace("auth.html"); return; }
    try { await loadDashboard(data.session.user); }
    catch (error) { showError(window.EarnStationErrors.toBengali(error, "আবার চেষ্টা করুন।")); }
  })();
})();