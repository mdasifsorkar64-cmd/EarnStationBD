(() => {
  const client=window.supabase.createClient(window.EARNSTATION_SUPABASE_URL,window.EARNSTATION_SUPABASE_PUBLISHABLE_KEY);
  const $=id=>document.getElementById(id);
  const message=(text,error=false)=>{const el=$("admin-message");el.textContent=text;el.className="admin-message"+(error?" error":"");};
  const statusBn=v=>({pending:"অপেক্ষমাণ",active:"সক্রিয়",paused:"স্থগিত",rejected:"বাতিল",approved:"অনুমোদিত",paid:"SUCCESS · পরিশোধিত",refunded:"REFUNDED · টাকা ফেরত"}[v]||v||"—");
  const fmt=v=>v?new Date(v).toLocaleString("bn-BD",{dateStyle:"medium",timeStyle:"short"}):"তথ্য নেই";
  const money=v=>"৳ "+Number(v||0).toFixed(2);
  const el=(tag,cls,txt)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n;};
  const button=(label,action,cls="")=>{const b=el("button","status-button "+cls,label);b.type="button";b.addEventListener("click",()=>Promise.resolve().then(action).catch(e=>message(e.message||"কাজটি সম্পন্ন হয়নি।",true)));return b;};
  function showView(name){document.querySelectorAll(".admin-view").forEach(v=>v.classList.toggle("active",v.id==="view-"+name));document.querySelectorAll(".admin-nav").forEach(v=>v.classList.toggle("active",v.dataset.view===name));}
  document.querySelectorAll(".admin-nav").forEach(b=>b.addEventListener("click",()=>showView(b.dataset.view)));
  document.querySelectorAll("[data-go]").forEach(b=>b.addEventListener("click",()=>showView(b.dataset.go)));
  const membersStatCard=$("members-stat-card");
  const openMembersFromStat=()=>{showView("members");$("member-search").value="";loadMembers().catch(e=>message(e.message||"সদস্য তালিকা লোড করা যায়নি।",true));};
  membersStatCard.addEventListener("click",openMembersFromStat);
  membersStatCard.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();openMembersFromStat();}});
  const statCardActions={
    "offers-stat-card":()=>{showView("offers");loadOffers().catch(e=>message(e.message||"অফার তালিকা লোড হয়নি।",true));},
    "pending-stat-card":()=>{showView("conversions");loadConversions().catch(e=>message(e.message||"কমিশন তালিকা লোড হয়নি।",true));},
    "withdrawals-stat-card":()=>{showView("withdrawals");loadWithdrawals().catch(e=>message(e.message||"উত্তোলন তালিকা লোড হয়নি।",true));}
  };
  Object.entries(statCardActions).forEach(([id,action])=>{const card=$(id);card.addEventListener("click",action);card.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();action();}});});
  async function loadSettings(){
    $("settings-status").textContent="সেটিংস লোড হচ্ছে...";
    const {data,error}=await client.rpc("admin_get_platform_settings");
    if(error)throw error;
    $("minimum-withdrawal").value=data.minimum_withdrawal;
    $("ad-reward").value=data.ad_reward;
    $("daily-ad-limit").value=data.daily_ad_limit;
    $("ads-enabled").checked=!!data.ads_enabled;
    $("settings-status").textContent="সেটিংস লোড হয়েছে। বিজ্ঞাপন সরবরাহকারী সংযোগের অবস্থা: এখনো যুক্ত নয়।";
  }
  $("settings-form").addEventListener("submit",async event=>{
    event.preventDefault();
    const minimum=Number($("minimum-withdrawal").value),reward=Number($("ad-reward").value),limit=Number($("daily-ad-limit").value),enabled=$("ads-enabled").checked;
    if(!Number.isFinite(minimum)||minimum<1||!Number.isFinite(reward)||reward<0||!Number.isInteger(limit)||limit<0||limit>200){$("settings-status").textContent="সঠিক সীমা ও পরিমাণ লিখুন।";return;}
    if(enabled){$("settings-status").textContent="Ad Provider-এর যাচাইকৃত callback যুক্ত না হওয়া পর্যন্ত বিজ্ঞাপন চালু করা যাবে না।";$("ads-enabled").checked=false;return;}
    $("save-settings").disabled=true;
    try{
      const {error}=await client.rpc("admin_update_platform_settings",{p_minimum_withdrawal:minimum,p_ad_reward:reward,p_daily_ad_limit:limit,p_ads_enabled:false});
      if(error)throw error;
      $("settings-status").textContent="সেটিংস সংরক্ষিত হয়েছে। বিজ্ঞাপন আপাতত বন্ধ আছে।";
      message("আয় ও উত্তোলনের নিয়ম আপডেট হয়েছে।");
    }catch(e){$("settings-status").textContent=e.message||"সেটিংস সংরক্ষণ করা যায়নি。";message(e.message||"সেটিংস সংরক্ষণ করা যায়নি।",true);}
    finally{$("save-settings").disabled=false;}
  });
  $("refresh-settings").addEventListener("click",()=>loadSettings().catch(e=>message(e.message,true)));
  async function loadMembers(){
    $("members-list").textContent="সদস্য তালিকা লোড হচ্ছে...";
    const {data,error}=await client.rpc("admin_list_members",{p_search:$("member-search").value.trim()});
    if(error)throw error;
    const ids=(data||[]).map(m=>m.id);const states=ids.length?await client.from("profiles").select("id,account_status").in("id",ids):{data:[],error:null};if(states.error)throw states.error;
    const stateMap=new Map((states.data||[]).map(x=>[x.id,x.account_status]));(data||[]).forEach(m=>m.account_status=stateMap.get(m.id)||"active");
    $("member-count").textContent=(data?.length||0)+" জন সদস্য";
    if(!$("member-search").value.trim()) $("stat-members").textContent=String(data?.length||0);
    const root=$("members-list");root.replaceChildren();
    if(!data?.length){root.textContent="কোনো সদস্য পাওয়া যায়নি।";return;}
    data.forEach(m=>{
      const card=el("article","member-card"),top=el("div","member-top"),left=el("div","");
      left.append(el("div","member-name",m.full_name||"নাম দেওয়া হয়নি"),el("div","member-email",m.email||"ইমেইল নেই"));
      top.append(left,el("span","role-pill",m.role==="admin"?"ADMIN":(m.account_status==="suspended"?"SUSPENDED":"MEMBER")));card.append(top);
      const meta=el("div","member-meta");
      const fields=[["User ID",m.id],["ফোন",m.phone||"দেওয়া হয়নি"],["নিবন্ধন",fmt(m.created_at)],["সর্বশেষ লগইন",fmt(m.last_sign_in_at)]];
      fields.forEach(([label,value])=>{const box=el("div","");box.append(el("small","",label),el("b","",value));meta.append(box);});
      card.append(meta);if(m.role!=="admin"){const actions=el("div","admin-row-actions");actions.append(button(m.account_status==="suspended"?"পুনরায় Active":"Suspend",async()=>{if(!confirm("এই সদস্যের অ্যাকাউন্টের অবস্থা পরিবর্তন করবেন?"))return;const next=m.account_status==="suspended"?"active":"suspended";const {error}=await client.rpc("admin_set_member_status",{p_user_id:m.id,p_status:next});if(error)throw error;message("সদস্যের অবস্থা আপডেট হয়েছে।");await loadMembers();},m.account_status==="suspended"?"active":"paused"));actions.append(button("পরীক্ষামূলক ৳১০০ যোগ",async()=>{if(!confirm((m.full_name||"এই সদস্য")+"-এর হিসাবে পরীক্ষামূলক ৳১০০ যোগ করবেন? এটি বাস্তব অর্থ নয় এবং বাস্তব পেমেন্টে ব্যবহার করা যাবে না।"))return;const {error}=await client.rpc("admin_add_test_balance",{p_user_id:m.id,p_amount:100});if(error)throw error;message("পরীক্ষামূলক ৳১০০ যোগ হয়েছে। সদস্যের ড্যাশবোর্ড রিফ্রেশ করুন।");await loadMembers();},"active"));card.append(actions);}root.append(card);
    });
  }
  let memberTimer;
  $("member-search").addEventListener("input",()=>{clearTimeout(memberTimer);memberTimer=setTimeout(()=>loadMembers().catch(e=>message(e.message,true)),250);});
  $("refresh-members").addEventListener("click",()=>loadMembers().catch(e=>message(e.message,true)));
  async function loadOffers(){
    $("offers-table").textContent="লোড হচ্ছে...";
    const {data,error}=await client.from("offers").select("id,title,partner_name,status,destination_url,created_at").order("created_at",{ascending:false}).limit(100);if(error)throw error;
    const root=$("offers-table");root.replaceChildren();$("stat-offers").textContent=data.length;
    if(!data.length){root.textContent="এখনো কোনো অফার যোগ করা হয়নি।";return;}
    data.forEach(item=>{const row=el("div","admin-row"),info=el("div","admin-row-main");info.append(el("b","",item.title),el("small","",item.partner_name+" · "+statusBn(item.status)));row.append(info);
      const actions=el("div","admin-row-actions");
      ["active","paused","rejected"].forEach(status=>{const b=button(status==="active"?"সক্রিয়":statusBn(status),async()=>{if(status==="active")return;await changeOffer(item.id,status);},status);if(status==="active"){b.disabled=true;b.title="যাচাইকৃত ট্র্যাকিং যুক্ত না হওয়া পর্যন্ত বন্ধ";}actions.append(b);});
      row.append(actions);root.append(row);});
  }
  async function changeOffer(id,status){message("অফারের অবস্থা আপডেট হচ্ছে...");const {error}=await client.from("offers").update({status}).eq("id",id);if(error)throw error;message("অফারের অবস্থা আপডেট হয়েছে।");await loadOffers();}
  async function loadConversions(){
    $("conversions-list").textContent="লোড হচ্ছে...";
    const {data,error}=await client.from("partner_conversions").select("id,partner_name,external_conversion_id,commission_amount,status,received_at").order("received_at",{ascending:false}).limit(100);if(error)throw error;
    const root=$("conversions-list");root.replaceChildren();$("stat-pending").textContent=data.filter(x=>x.status==="pending").length;
    if(!data.length){root.textContent="এখনো কোনো পার্টনার কনভার্সন আসেনি।";return;}
    data.forEach(item=>{const row=el("div","admin-row"),info=el("div","admin-row-main");info.append(el("b","",item.partner_name+" · "+money(item.commission_amount)),el("small","","রেফারেন্স: "+item.external_conversion_id+" · "+statusBn(item.status)));row.append(info);
      const actions=el("div","admin-row-actions");if(item.status==="pending"){actions.append(button("অনুমোদন",()=>reviewConversion(item.id,"approved"),"active"),button("বাতিল",()=>reviewConversion(item.id,"rejected"),"rejected"));}row.append(actions);root.append(row);});
  }
  async function reviewConversion(id,decision){if(!confirm(decision==="approved"?"যাচাইকৃত কনভার্সন অনুমোদন করবেন? কমিশন একবার লেজারে যোগ হবে।":"এই কনভার্সন বাতিল করবেন?"))return;message("কনভার্সন পর্যালোচনা হচ্ছে...");const {error}=await client.rpc("admin_review_conversion",{p_conversion_id:id,p_decision:decision,p_note:""});if(error)throw error;message("কনভার্সন পর্যালোচনা সম্পন্ন।");await loadConversions();}
  async function loadWithdrawals(){
    $("withdrawals-list").textContent="লোড হচ্ছে...";
    const {data:{session}}=await client.auth.getSession();
    if(!session) throw new Error("আবার লগইন করুন।");
    const response=await fetch("http://127.0.0.1:3001/api/admin/withdrawals",{headers:{Authorization:"Bearer "+session.access_token}});
    const result=await response.json();
    if(!response.ok) throw new Error(result.error||"উইথড্র তালিকা লোড করা যায়নি।");
    const data=result.withdrawals||[];
    const root=$("withdrawals-list");root.replaceChildren();
    $("stat-withdrawals").textContent=data.filter(x=>["pending","approved"].includes(x.status)).length;
    if(!data.length){root.textContent="এখনো কোনো উত্তোলনের অনুরোধ নেই।";return;}
    data.forEach(w=>{
      const row=el("div","admin-row"),info=el("div","admin-row-main");
      const member=w.member||{};
      info.append(
        el("b","", (w.is_test?"[TEST] পরীক্ষামূলক · ":"")+money(w.amount)+" · "+(w.payout_method==="bkash"?"বিকাশ":"নগদ")+" · "+statusBn(w.status)),
        el("small","","সদস্য: "+(member.full_name||"নাম নেই")+" · "+(member.phone||"ফোন নেই")),
        el("small","","পেমেন্ট নম্বর: "+w.payout_account),
        el("small","","User ID: "+w.user_id),
        el("small","","উইথড্রের সময়: "+fmt(w.created_at)+" · শেষ সময়: "+fmt(w.expires_at))
      );
      if(w.paid_at) info.append(el("small","","পেমেন্ট সম্পন্ন: "+fmt(w.paid_at)));
      if(w.payment_transaction_id) info.append(el("small","","Transaction ID: "+w.payment_transaction_id));
      if(w.refunded_at) info.append(el("small","","টাকা ফেরত: "+fmt(w.refunded_at)));
      if(w.admin_note) info.append(el("small","","নোট: "+w.admin_note));
      if(w.is_test) info.append(el("small","","এটি পরীক্ষামূলক অনুরোধ—বাস্তব পেমেন্ট নিষিদ্ধ। ৫ ঘণ্টা পরে স্বয়ংক্রিয়ভাবে REFUNDED হবে।"));
      row.append(info);
      if(!w.is_test && ["pending","approved"].includes(w.status)){
        row.append(button("টাকা পাঠিয়েছি · SUCCESS করুন",async()=>{
          const transactionId=prompt("বিকাশ/নগদে "+money(w.amount)+" পাঠানোর পর প্রাপ্ত Transaction ID লিখুন:");
          if(transactionId===null)return;
          const cleanTransactionId=transactionId.trim();
          if(cleanTransactionId.length<4||cleanTransactionId.length>100){throw new Error("সঠিক Transaction ID লিখুন (৪–১০০ অক্ষর)।");}
          if(!confirm("সদস্যকে "+money(w.amount)+" সত্যিই পাঠানো হয়েছে এবং Transaction ID "+cleanTransactionId+" সঠিক? শুধু টাকা পাঠানোর পর SUCCESS করুন।"))return;
          const {data:{session:active}}=await client.auth.getSession();
          const res=await fetch("http://127.0.0.1:3001/api/admin/withdrawals/complete",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+active.access_token},body:JSON.stringify({withdrawal_id:w.id,transaction_id:cleanTransactionId})});
          const out=await res.json();if(!res.ok)throw new Error(out.error||"স্ট্যাটাস আপডেট হয়নি।");
          message(out.status==="refunded"?"৫ ঘণ্টা পার হয়েছে—টাকা সদস্যকে ফেরত দেওয়া হয়েছে।":"পেমেন্ট SUCCESS হিসেবে সংরক্ষিত হয়েছে।");
          await loadWithdrawals();
        },"active"));
      }
      root.append(row);
    });
  }
  $("offer-form").addEventListener("submit",async event=>{event.preventDefault();const form=event.currentTarget,data=Object.fromEntries(new FormData(form).entries());try{const url=new URL(data.destination_url);if(!["https:","http:"].includes(url.protocol))throw new Error("শুধু HTTP/HTTPS লিংক ব্যবহার করুন।");$("offer-submit").disabled=true;message("অফার সংরক্ষণ হচ্ছে...");const {error}=await client.from("offers").insert({...data,status:"pending"});if(error)throw error;form.reset();message("অফার সংরক্ষিত হয়েছে। Pending অবস্থায় রাখা হয়েছে।");await loadOffers();}catch(e){message(e.message||"অফার সংরক্ষণ করা যায়নি।",true);}finally{$("offer-submit").disabled=false;}});
  $("refresh-offers").addEventListener("click",()=>loadOffers().catch(e=>message(e.message,true)));
  $("refresh-conversions").addEventListener("click",()=>loadConversions().catch(e=>message(e.message,true)));
  $("refresh-withdrawals").addEventListener("click",()=>loadWithdrawals().catch(e=>message(e.message,true)));

  async function loadSiteSettings(){
    $("site-status").textContent="সেটিংস লোড হচ্ছে...";
    const {data,error}=await client.rpc("admin_get_site_settings");if(error)throw error;
    $("site-name").value=data.site_name||"EarnStationBD";$("site-tagline").value=data.site_tagline||"";$("site-announcement").value=data.announcement||"";$("site-contact").value=data.contact_email||"";
    $("site-status").textContent="ওয়েবসাইট সেটিংস লোড হয়েছে।";
    const audit=await client.rpc("admin_get_audit_log");if(audit.error)throw audit.error;
    const root=$("audit-list");root.replaceChildren();if(!audit.data?.length){root.textContent="এখনো কোনো পরিবর্তনের রেকর্ড নেই।";return;}
    audit.data.forEach(x=>{const row=el("div","admin-row");row.append(el("div","admin-row-main",""),el("small","",x.action+" · "+fmt(x.created_at)));row.firstChild.append(el("b","",x.action),el("small","",JSON.stringify(x.details||{})));root.append(row);});
  }
  $("site-form").addEventListener("submit",async event=>{event.preventDefault();$("save-site").disabled=true;try{
    const {error}=await client.rpc("admin_update_site_settings",{p_site_name:$("site-name").value.trim(),p_site_tagline:$("site-tagline").value.trim(),p_announcement:$("site-announcement").value.trim(),p_contact_email:$("site-contact").value.trim()||null});if(error)throw error;
    $("site-status").textContent="ওয়েবসাইট সেটিংস সংরক্ষিত হয়েছে।";message("ওয়েবসাইট সেটিংস আপডেট হয়েছে।");await loadSiteSettings();
  }catch(e){$("site-status").textContent=e.message||"সংরক্ষণ করা যায়নি।";message(e.message||"সংরক্ষণ করা যায়নি।",true);}finally{$("save-site").disabled=false;}});
  $("refresh-site").addEventListener("click",()=>loadSiteSettings().catch(e=>message(e.message,true)));

  async function refreshAll(){try{await Promise.all([loadMembers(),loadOffers(),loadConversions(),loadWithdrawals(),loadSettings(),loadSiteSettings()]);message("সব তথ্য আপডেট হয়েছে।");}catch(e){message(e.message||"তথ্য লোড করা যায়নি।",true);}}
  $("refresh-all").addEventListener("click",refreshAll);
  (async()=>{try{const {data,error}=await client.auth.getSession();if(error)throw error;if(!data.session){location.replace("auth.html");return;}const {data:profile,error:pe}=await client.from("profiles").select("role").eq("id",data.session.user.id).single();if(pe)throw pe;if(profile?.role!=="admin"){location.replace("dashboard.html");return;}
    $("admin-top").hidden=false;$("admin-content").hidden=false;$("admin-footer").hidden=false;message("অ্যাডমিন যাচাই সফল।");await refreshAll();
  }catch(e){message(e.message||"অ্যাডমিন প্যানেল লোড করা যায়নি।",true);}})();
})();