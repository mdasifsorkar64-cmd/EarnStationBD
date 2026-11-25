(() => {
  const client=window.supabase.createClient(window.EARNSTATION_SUPABASE_URL,window.EARNSTATION_SUPABASE_PUBLISHABLE_KEY);
  const $=id=>document.getElementById(id);
  const message=(text,error=false)=>{const el=$("admin-message");el.textContent=text;el.className="admin-message"+(error?" error":"");};
  const statusBn=v=>({pending:"অপেক্ষমাণ",active:"সক্রিয়",paused:"স্থগিত",rejected:"বাতিল",approved:"অনুমোদিত",paid:"SUCCESS · পরিশোধিত",refunded:"REFUNDED · টাকা ফেরত"}[v]||v||"—");
  const fmt=v=>v?new Date(v).toLocaleString("bn-BD",{dateStyle:"medium",timeStyle:"short"}):"তথ্য নেই";
  const money=v=>"৳ "+Number(v||0).toFixed(2);
  async function parseApiResponse(response){const raw=await response.text();try{return JSON.parse(raw);}catch{const type=response.headers.get("content-type")||"";throw new Error(type.includes("text/html")?"API-এর বদলে HTML এসেছে। পেজটি রিফ্রেশ করে আবার চেষ্টা করুন; সমস্যা থাকলে Preview routing পরীক্ষা করতে হবে।":"সার্ভারের উত্তর পড়া যায়নি। আবার চেষ্টা করুন।");}}
  const el=(tag,cls,txt)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n;};
  const button=(label,action,cls="")=>{const b=el("button","status-button "+cls,label);b.type="button";b.addEventListener("click",()=>Promise.resolve().then(action).catch(e=>message(e.message||"কাজটি সম্পন্ন হয়নি।",true)));return b;};
  function showView(name){document.querySelectorAll(".admin-view").forEach(v=>v.classList.toggle("active",v.id==="view-"+name));document.querySelectorAll(".admin-nav").forEach(v=>v.classList.toggle("active",v.dataset.view===name));}
  function navigateView(name){if(!document.getElementById("view-"+name))return;history.pushState({adminView:name},"","#admin-"+name);showView(name);}
  history.replaceState({adminView:"overview"},"","#admin-overview");
  window.addEventListener("popstate",event=>showView(event.state?.adminView||"overview"));
  $("admin-back-button").addEventListener("click",()=>{if(history.length>1)history.back();else navigateView("overview");});
  document.querySelectorAll(".admin-nav").forEach(b=>b.addEventListener("click",()=>navigateView(b.dataset.view)));
  document.querySelectorAll("[data-go]").forEach(b=>b.addEventListener("click",()=>navigateView(b.dataset.go)));
  const membersStatCard=$("members-stat-card");
  const openMembersFromStat=()=>{navigateView("members");$("member-search").value="";loadMembers().catch(e=>message(e.message||"সদস্য তালিকা লোড করা যায়নি।",true));};
  membersStatCard.addEventListener("click",openMembersFromStat);
  membersStatCard.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();openMembersFromStat();}});
  const statCardActions={
    "offers-stat-card":()=>{navigateView("offers");loadOffers().catch(e=>message(e.message||"অফার তালিকা লোড হয়নি।",true));},
    "pending-stat-card":()=>{navigateView("conversions");loadConversions().catch(e=>message(e.message||"কমিশন তালিকা লোড হয়নি।",true));},
    "withdrawals-stat-card":()=>{navigateView("withdrawals");loadWithdrawals().catch(e=>message(e.message||"উত্তোলন তালিকা লোড হয়নি।",true));}
  };
  Object.entries(statCardActions).forEach(([id,action])=>{const card=$(id);card.addEventListener("click",action);card.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();action();}});});
  const ownerMoney=v=>"৳ "+Number(v||0).toFixed(2);
  const ownerStatus=v=>({awaiting_partner_payment:"পার্টনারের কাছে পাওনা",received:"পার্টনারের টাকা পাওয়া গেছে",reversed:"বাতিল / Reversed"}[v]||v);
  async function loadOwnerWallet(){
    $("owner-allocations").textContent="লোড হচ্ছে...";
    const [summary,allocations,history,receiving]=await Promise.all([client.rpc("admin_get_owner_wallet_summary"),client.rpc("admin_list_owner_allocations"),client.from("owner_wallet_withdrawals").select("id,amount,payout_method,payment_transaction_id,note,created_at").order("created_at",{ascending:false}).limit(100),client.rpc("admin_get_owner_partner_payment_destinations")]);
    if(summary.error)throw summary.error;if(allocations.error)throw allocations.error;if(history.error)throw history.error;if(receiving.error)throw receiving.error;
    const destination=receiving.data?.[0]||{};
    $("owner-bkash-number").value=destination.bkash_number||"";$("owner-bkash-name").value=destination.bkash_account_name||"";$("owner-nagad-number").value=destination.nagad_number||"";$("owner-nagad-name").value=destination.nagad_account_name||"";
    $("owner-receiving-status").textContent=destination.updated_at?"সর্বশেষ সংরক্ষণ: "+fmt(destination.updated_at):"এখনো কোনো গ্রহণের নম্বর সংরক্ষণ করা হয়নি।";
    const s=Array.isArray(summary.data)?summary.data[0]:summary.data;
    if(!s)throw new Error("মালিকের Wallet হিসাব পাওয়া যায়নি।");
    $("owner-share-total").textContent=ownerMoney(s.owner_share_total_bdt);
    $("owner-awaiting").textContent=ownerMoney(s.awaiting_partner_payment_bdt);
    $("owner-received").textContent=ownerMoney(s.partner_payment_received_bdt);
    $("owner-reversed").textContent=ownerMoney(s.reversed_owner_share_bdt);
    $("owner-withdrawn").textContent=ownerMoney(s.owner_withdrawn_bdt);
    $("owner-available").textContent=ownerMoney(s.owner_available_bdt);
    const root=$("owner-allocations");root.replaceChildren();
    if(!allocations.data?.length){root.textContent="এখনো কোনো অনুমোদিত কমিশন Allocation নেই।";}else allocations.data.forEach(item=>{
      const row=el("div","admin-row"),info=el("div","admin-row-main");
      info.append(el("b","",item.partner_name+" · মালিকের অংশ "+ownerMoney(item.owner_share_bdt)),
        el("small","","রেফারেন্স: "+item.external_conversion_id+" · মোট কমিশন "+ownerMoney(item.partner_gross_bdt)),
        el("small","","অবস্থা: "+ownerStatus(item.partner_payment_status)+" · "+fmt(item.received_at)));
      row.append(info);const actions=el("div","admin-row-actions");
      if(item.partner_payment_status!=="received")actions.append(button("টাকা পেয়েছি",async()=>{
        if(!confirm(item.partner_name+" থেকে "+ownerMoney(item.owner_share_bdt)+" কমিশনের পেমেন্ট বাস্তবে পেয়েছেন?"))return;
        const {error}=await client.rpc("admin_set_partner_payment_status",{p_conversion_id:item.conversion_id,p_status:"received"});if(error)throw error;await loadOwnerWallet();
      },"active"));
      if(item.partner_payment_status!=="reversed")actions.append(button("Reversed",async()=>{
        if(!confirm("এই কমিশনটি পার্টনার বাতিল/ফেরত নিয়েছে—নিশ্চিত? ইতিমধ্যে উত্তোলিত অর্থ থাকলে সিস্টেম পরিবর্তন আটকাবে।"))return;
        const {error}=await client.rpc("admin_set_partner_payment_status",{p_conversion_id:item.conversion_id,p_status:"reversed"});if(error)throw error;await loadOwnerWallet();
      },"rejected"));
      if(item.partner_payment_status!=="awaiting_partner_payment")actions.append(button("অপেক্ষমাণ করুন",async()=>{
        if(!confirm("এই পার্টনার পেমেন্টকে আবার অপেক্ষমাণ করবেন?"))return;
        const {error}=await client.rpc("admin_set_partner_payment_status",{p_conversion_id:item.conversion_id,p_status:"awaiting_partner_payment"});if(error)throw error;await loadOwnerWallet();
      }));
      row.append(actions);root.append(row);
    });
    const hist=$("owner-withdrawal-history");hist.replaceChildren();
    if(!history.data?.length){hist.textContent="এখনো কোনো মালিকের উত্তোলন রেকর্ড নেই.";}else history.data.forEach(w=>{
      const row=el("div","admin-row"),info=el("div","admin-row-main");
      const method=({bkash:"বিকাশ",nagad:"নগদ",bank:"ব্যাংক",cash:"নগদ হাতে",other:"অন্যান্য"}[w.payout_method]||w.payout_method);
      info.append(el("b","",ownerMoney(w.amount)+" · "+method),el("small","","Transaction ID: "+w.payment_transaction_id+" · "+fmt(w.created_at)));
      if(w.note)info.append(el("small","", "নোট: "+w.note));row.append(info);hist.append(row);
    });
  }
  $("owner-withdrawal-form").addEventListener("submit",async event=>{
    event.preventDefault();
    const amount=Number($("owner-withdrawal-amount").value),method=$("owner-withdrawal-method").value,txid=$("owner-withdrawal-txid").value.trim(),note=$("owner-withdrawal-note").value.trim();
    if(!Number.isFinite(amount)||amount<=0||txid.length<4||txid.length>100){message("সঠিক পরিমাণ ও Transaction ID দিন।",true);return;}
    if(!confirm(ownerMoney(amount)+" মালিকের Wallet থেকে উত্তোলন হিসেবে রেকর্ড করবেন? টাকা বাস্তবে পেয়েছেন/উত্তোলন করেছেন নিশ্চিত করুন।"))return;
    $("owner-withdrawal-submit").disabled=true;
    try{const {error}=await client.rpc("admin_record_owner_withdrawal",{p_amount:amount,p_method:method,p_transaction_id:txid,p_note:note});if(error)throw error;
      $("owner-withdrawal-form").reset();message("মালিকের উত্তোলন রেকর্ড হয়েছে।");await loadOwnerWallet();
    }catch(e){message(e.message||"উত্তোলন রেকর্ড করা যায়নি।",true);}finally{$("owner-withdrawal-submit").disabled=false;}
  });
  $("owner-receiving-form").addEventListener("submit",async event=>{
    event.preventDefault();
    const bkash=$("owner-bkash-number").value.trim().replaceAll(" ","").replaceAll("-","");
    const bkashName=$("owner-bkash-name").value.trim();
    const nagad=$("owner-nagad-number").value.trim().replaceAll(" ","").replaceAll("-","");
    const nagadName=$("owner-nagad-name").value.trim();
    const validNumber=value=>!value||(value.length===11&&value.startsWith("01")&&"3456789".includes(value[2])&&Number.isInteger(Number(value)));
    if(!bkash&&!nagad){$("owner-receiving-status").textContent="বিকাশ অথবা নগদের অন্তত একটি নম্বর দিন।";return;}
    if(!validNumber(bkash)||!validNumber(nagad)){$("owner-receiving-status").textContent="সঠিক ১১ সংখ্যার বাংলাদেশি মোবাইল নম্বর লিখুন।";return;}
    if((bkash&&bkashName.length<2)||(nagad&&nagadName.length<2)){$("owner-receiving-status").textContent="যে নম্বরটি ব্যবহার করবেন, তার অ্যাকাউন্টের নামও দিন।";return;}
    const save=$("owner-receiving-save");save.disabled=true;$("owner-receiving-status").textContent="সংরক্ষণ হচ্ছে...";
    try{
      const {error}=await client.rpc("admin_save_owner_partner_payment_destinations",{p_bkash_number:bkash||null,p_bkash_account_name:bkashName||null,p_nagad_number:nagad||null,p_nagad_account_name:nagadName||null});
      if(error)throw error;
      $("owner-receiving-status").textContent="বিকাশ/নগদ গ্রহণের তথ্য সংরক্ষিত হয়েছে।";message("পার্টনারের কমিশন গ্রহণের নম্বর সংরক্ষিত হয়েছে।");
    }catch(e){$("owner-receiving-status").textContent=e.message||"নম্বর সংরক্ষণ করা যায়নি।";message(e.message||"নম্বর সংরক্ষণ করা যায়নি।",true);}
    finally{save.disabled=false;}
  });
  $("refresh-owner-wallet").addEventListener("click",()=>loadOwnerWallet().catch(e=>message(e.message,true)));

  async function loadSettings(){
    $("settings-status").textContent="সেটিংস লোড হচ্ছে...";
    $("payout-fee-status").textContent="চার্জ সেটিংস লোড হচ্ছে...";
    const [{data,error},{data:fee,error:feeError}]=await Promise.all([
      client.rpc("admin_get_platform_settings"),
      client.rpc("admin_get_member_payout_fee")
    ]);
    if(error)throw error;if(feeError)throw feeError;
    $("minimum-withdrawal").value=data.minimum_withdrawal;
    $("ad-reward").value=data.ad_reward;
    $("daily-ad-limit").value=data.daily_ad_limit;
    $("ads-enabled").checked=!!data.ads_enabled;
    $("member-payout-fee").value=Number(fee??0).toFixed(2);
    $("settings-status").textContent="সেটিংস লোড হয়েছে। বিজ্ঞাপন সরবরাহকারী সংযোগের অবস্থা: এখনো যুক্ত নয়।";
    $("payout-fee-status").textContent="বর্তমান সদস্য উত্তোলন চার্জ: ৳ "+Number(fee??0).toFixed(2);
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
  $("payout-fee-form").addEventListener("submit",async event=>{
    event.preventDefault();
    const fee=Number($("member-payout-fee").value);
    if(!Number.isFinite(fee)||fee<0||fee>100){$("payout-fee-status").textContent="চার্জ ০ থেকে ১০০ টাকার মধ্যে লিখুন।";return;}
    $("save-payout-fee").disabled=true;
    $("payout-fee-status").textContent="সংরক্ষণ হচ্ছে...";
    try{
      const {error}=await client.rpc("admin_update_member_payout_fee",{p_fee:fee});
      if(error)throw error;
      await loadSettings();
      message("সদস্য উত্তোলন চার্জ আপডেট হয়েছে।");
    }catch(e){$("payout-fee-status").textContent=e.message||"চার্জ সংরক্ষণ করা যায়নি।";message(e.message||"চার্জ সংরক্ষণ করা যায়নি।",true);}
    finally{$("save-payout-fee").disabled=false;}
  });
  $("refresh-settings").addEventListener("click",()=>Promise.all([loadSettings(),loadReferralSettings()]).catch(e=>message(e.message,true)));
  async function loadReferralSettings(){
    const {data,error}=await client.rpc("admin_get_referral_settings");if(error)throw error;
    const row=Array.isArray(data)?data[0]:data;if(!row)throw new Error("রেফারেল সেটিংস পাওয়া যায়নি।");
    $("referral-bonus-amount").value=row.bonus_amount;
    $("referral-admin-stats").textContent="সফল রেফারেল: "+Number(row.successful_referrals||0).toLocaleString("bn-BD")+" · মোট বোনাস: ৳ "+Number(row.total_paid||0).toFixed(2);
    $("referral-settings-status").textContent="রেফারেল সেটিংস লোড হয়েছে।";
  }
  $("referral-settings-form").addEventListener("submit",async event=>{
    event.preventDefault();const amount=Number($("referral-bonus-amount").value);
    if(!Number.isFinite(amount)||amount<0||amount>10000){$("referral-settings-status").textContent="০ থেকে ১০,০০০ টাকার মধ্যে পরিমাণ লিখুন।";return;}
    $("save-referral-settings").disabled=true;
    try{const {error}=await client.rpc("admin_update_referral_bonus",{p_bonus_amount:amount});if(error)throw error;await loadReferralSettings();message("রেফারেল কমিশন আপডেট হয়েছে।");}
    catch(e){$("referral-settings-status").textContent=e.message||"রেফারেল বোনাস সংরক্ষণ হয়নি।";message(e.message||"রেফারেল বোনাস সংরক্ষণ হয়নি।",true);}
    finally{$("save-referral-settings").disabled=false;}
  });
    async function loadMembers(){
    $("members-list").textContent="সদস্য তালিকা লোড হচ্ছে...";
    const {data,error}=await client.rpc("admin_list_members",{p_search:$("member-search").value.trim()});
    if(error)throw error;
    const {data:presenceData,error:presenceError}=await client.rpc("admin_get_member_presence");
    if(presenceError)throw presenceError;
    const presenceMap=new Map((presenceData||[]).map(p=>[p.user_id,p]));
    const ids=(data||[]).map(m=>m.id);const states=ids.length?await client.from("profiles").select("id,account_status").in("id",ids):{data:[],error:null};if(states.error)throw states.error;
    const stateMap=new Map((states.data||[]).map(x=>[x.id,x.account_status]));(data||[]).forEach(m=>m.account_status=stateMap.get(m.id)||"active");
    $("member-count").textContent=(data?.length||0)+" জন সদস্য";
    if(!$("member-search").value.trim()) $("stat-members").textContent=String(data?.length||0);
    const root=$("members-list");root.replaceChildren();
    if(!data?.length){root.textContent="কোনো সদস্য পাওয়া যায়নি।";return;}
    data.forEach(m=>{
      const card=el("article","member-card"),top=el("div","member-top"),left=el("div",""),statusStack=el("div","member-status-stack");
      left.append(el("div","member-name",m.full_name||"নাম দেওয়া হয়নি"),el("div","member-email",m.email||"ইমেইল নেই"));
      statusStack.append(el("span","role-pill",m.role==="admin"?"ADMIN":(m.account_status==="suspended"?"SUSPENDED":"ACTIVE · MEMBER")));
      if(m.role!=="admin"){
        const online=Boolean(presenceMap.get(m.id)?.is_online);
        statusStack.append(el("span","presence-badge "+(online?"is-online":"is-offline"),online?"● অনলাইন":"○ অফলাইন"));
      }
      top.append(left,statusStack);card.append(top);
      const meta=el("div","member-meta");
      const fields=[["User ID",m.id],["ফোন",m.phone||"দেওয়া হয়নি"],["নিবন্ধন",fmt(m.created_at)],["সর্বশেষ লগইন",fmt(m.last_sign_in_at)]];
      fields.forEach(([label,value])=>{const box=el("div","");box.append(el("small","",label),el("b","",value));meta.append(box);});
      card.append(meta);if(m.role!=="admin"){const actions=el("div","admin-row-actions");const isSuspended=m.account_status==="suspended";actions.append(button(isSuspended?"পুনরায় Active":"Suspend অ্যাকাউন্ট",async()=>{const displayName=m.full_name||m.email||"এই সদস্য";const promptText=isSuspended?displayName+"-এর অ্যাকাউন্ট পুনরায় Active করবেন?":"সতর্কতা: "+displayName+" ("+(m.email||"ইমেইল নেই")+")-এর অ্যাকাউন্ট Suspend করবেন? সদস্য লগইন/সেবা ব্যবহার করতে পারবেন না। Admin অ্যাকাউন্ট এই তালিকা থেকে পরিবর্তন করা যায় না।";if(!confirm(promptText))return;const next=isSuspended?"active":"suspended";const {error}=await client.rpc("admin_set_member_status",{p_user_id:m.id,p_status:next});if(error)throw error;message(isSuspended?"সদস্যের অ্যাকাউন্ট পুনরায় Active হয়েছে।":"সদস্যের অ্যাকাউন্ট Suspend হয়েছে।");await loadMembers();},isSuspended?"active":"paused"));actions.append(button("পরীক্ষামূলক ৳১০০ যোগ",async()=>{if(!confirm((m.full_name||"এই সদস্য")+"-এর হিসাবে পরীক্ষামূলক ৳১০০ যোগ করবেন? এটি বাস্তব অর্থ নয় এবং বাস্তব পেমেন্টে ব্যবহার করা যাবে না।"))return;const {error}=await client.rpc("admin_add_test_balance",{p_user_id:m.id,p_amount:100});if(error)throw error;message("পরীক্ষামূলক ৳১০০ যোগ হয়েছে। সদস্যের ড্যাশবোর্ড রিফ্রেশ করুন।");await loadMembers();},"active"));card.append(actions);}root.append(card);
    });
  }

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
    const response=await fetch("/api/admin/withdrawals",{headers:{Authorization:"Bearer "+session.access_token}});
    const result=await parseApiResponse(response);
    if(!response.ok) throw new Error(result.error||"উইথড্র তালিকা লোড করা যায়নি।");
    const data=result.withdrawals||[];
    const root=$("withdrawals-list");root.replaceChildren();
    $("stat-withdrawals").textContent=data.filter(x=>["pending","approved"].includes(x.status)).length;
    if(!data.length){root.textContent="এখনো কোনো উত্তোলনের অনুরোধ নেই।";return;}
    data.forEach(w=>{
      const row=el("div","admin-row"),info=el("div","admin-row-main");
      const member=w.member||{};
      const gross=Number(w.amount||0), fee=Number(w.payout_fee_bdt||0), net=Number(w.payout_net_bdt??gross);
      info.append(
        el("b","", (w.is_test?"[TEST] পরীক্ষামূলক · ":"")+"উত্তোলন "+money(gross)+" · "+(w.payout_method==="bkash"?"বিকাশ":"নগদ")+" · "+statusBn(w.status)),
        el("small","","পেমেন্ট হিসাব: মোট "+money(gross)+" · চার্জ "+money(fee)+" · সদস্যকে পাঠাতে হবে "+money(net)),
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
          const net=Number(w.payout_net_bdt??w.amount);
          const transactionId=prompt("সদস্যকে "+money(net)+" পাঠানোর পর প্রাপ্ত Transaction ID লিখুন:");
          if(transactionId===null)return;
          const cleanTransactionId=transactionId.trim();
          if(cleanTransactionId.length<4||cleanTransactionId.length>100){throw new Error("সঠিক Transaction ID লিখুন (৪–১০০ অক্ষর)।");}
          if(!confirm("সদস্যকে নেট "+money(net)+" সত্যিই পাঠানো হয়েছে এবং Transaction ID "+cleanTransactionId+" সঠিক? শুধু টাকা পাঠানোর পর SUCCESS করুন।"))return;
          const {data:{session:active}}=await client.auth.getSession();
          const res=await fetch("/api/admin/withdrawals/complete",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+active.access_token},body:JSON.stringify({withdrawal_id:w.id,transaction_id:cleanTransactionId})});
          const out=await parseApiResponse(res);if(!res.ok)throw new Error(out.error||"স্ট্যাটাস আপডেট হয়নি।");
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

  async function loadCommunitySettings(){
    $("community-status").textContent="কমিউনিটি লিংক লোড হচ্ছে...";
    const {data,error}=await client.rpc("admin_get_community_links"); if(error)throw error;
    $("community-facebook").value=data.facebook_url||""; $("community-telegram").value=data.telegram_url||""; $("community-whatsapp").value=data.whatsapp_url||""; $("community-youtube").value=data.youtube_url||"";
    $("community-status").textContent="কমিউনিটি লিংক লোড হয়েছে।";
  }
  $("community-form").addEventListener("submit",async event=>{
    event.preventDefault(); const fields=[["facebook","community-facebook"],["telegram","community-telegram"],["whatsapp","community-whatsapp"],["youtube","community-youtube"]];
    const values={};
    try {
      for(const [name,id] of fields){const raw=$(id).value.trim(); if(raw){const u=new URL(raw); if(u.protocol!=="https:")throw new Error("শুধু নিরাপদ HTTPS লিংক ব্যবহার করুন।");} values[name]=raw||null;}
      $("save-community").disabled=true; $("community-status").textContent="লিংক সংরক্ষণ হচ্ছে...";
      const {error}=await client.rpc("admin_update_community_links",{p_facebook_url:values.facebook,p_telegram_url:values.telegram,p_whatsapp_url:values.whatsapp,p_youtube_url:values.youtube}); if(error)throw error;
      $("community-status").textContent="কমিউনিটি লিংক সংরক্ষিত হয়েছে।"; message("কমিউনিটি লিংক আপডেট হয়েছে।");
    } catch(e){$("community-status").textContent=e.message||"লিংক সংরক্ষণ করা যায়নি।"; message(e.message||"লিংক সংরক্ষণ করা যায়নি।",true);}
    finally{$("save-community").disabled=false;}
  });

  async function loadSiteSettings(){
    $("site-status").textContent="সেটিংস লোড হচ্ছে...";
    const {data,error}=await client.rpc("admin_get_site_settings");if(error)throw error;
    $("site-name").value=data.site_name||"EarnStationBD";$("site-tagline").value=data.site_tagline||"";$("site-announcement").value=data.announcement||"";$("site-contact").value=data.contact_email||"";
    $("site-status").textContent="ওয়েবসাইট সেটিংস লোড হয়েছে।";
    await loadCommunitySettings();
    const audit=await client.rpc("admin_get_audit_log");if(audit.error)throw audit.error;
    const root=$("audit-list");root.replaceChildren();if(!audit.data?.length){root.textContent="এখনো কোনো পরিবর্তনের রেকর্ড নেই।";return;}
    audit.data.forEach(x=>{const row=el("div","admin-row");row.append(el("div","admin-row-main",""),el("small","",x.action+" · "+fmt(x.created_at)));row.firstChild.append(el("b","",x.action),el("small","",JSON.stringify(x.details||{})));root.append(row);});
  }
  $("site-form").addEventListener("submit",async event=>{event.preventDefault();$("save-site").disabled=true;try{
    const {error}=await client.rpc("admin_update_site_settings",{p_site_name:$("site-name").value.trim(),p_site_tagline:$("site-tagline").value.trim(),p_announcement:$("site-announcement").value.trim(),p_contact_email:$("site-contact").value.trim()||null});if(error)throw error;
    $("site-status").textContent="ওয়েবসাইট সেটিংস সংরক্ষিত হয়েছে।";message("ওয়েবসাইট সেটিংস আপডেট হয়েছে।");await loadSiteSettings();
  }catch(e){$("site-status").textContent=e.message||"সংরক্ষণ করা যায়নি।";message(e.message||"সংরক্ষণ করা যায়নি।",true);}finally{$("save-site").disabled=false;}});
  $("refresh-site").addEventListener("click",()=>loadSiteSettings().catch(e=>message(e.message,true)));

  async function refreshAll(){const tasks=[["সদস্য",loadMembers],["অফার",loadOffers],["কমিশন",loadConversions],["উত্তোলন",loadWithdrawals],["মালিকের Wallet",loadOwnerWallet],["আয় ও সীমা",loadSettings],["ওয়েবসাইট",loadSiteSettings],["রেফারেল",loadReferralSettings]];const results=await Promise.allSettled(tasks.map(([,fn])=>fn()));const failed=results.map((r,i)=>r.status==="rejected"?tasks[i][0]+": "+(r.reason?.message||"লোড হয়নি"):null).filter(Boolean);if(failed.length)message("কিছু তথ্য লোড হয়নি। অন্য অংশগুলো আপডেট হয়েছে। "+failed.join(" | "),true);else message("সব তথ্য আপডেট হয়েছে।");}
  $("refresh-all").addEventListener("click",refreshAll);
  (async()=>{try{const {data,error}=await client.auth.getSession();if(error)throw error;if(!data.session){location.replace("auth.html");return;}const {data:profile,error:pe}=await client.from("profiles").select("role").eq("id",data.session.user.id).single();if(pe)throw pe;if(profile?.role!=="admin"){location.replace("dashboard.html");return;}
    $("admin-top").hidden=false;$("admin-content").hidden=false;$("admin-footer").hidden=false;message("অ্যাডমিন যাচাই সফল।");await refreshAll();
  }catch(e){message(e.message||"অ্যাডমিন প্যানেল লোড করা যায়নি।",true);}})();
})();