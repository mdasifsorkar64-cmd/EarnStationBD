(() => {
  const client=window.supabase.createClient(window.EARNSTATION_SUPABASE_URL,window.EARNSTATION_SUPABASE_PUBLISHABLE_KEY);
  const $=id=>document.getElementById(id);
  const message=(text,error=false)=>{const el=$("admin-message");el.textContent=text;el.className="admin-message"+(error?" error":"");};
  const statusBn=v=>({pending:"অপেক্ষমাণ",active:"সক্রিয়",paused:"স্থগিত",rejected:"বাতিল",approved:"অনুমোদিত",paid:"পরিশোধিত"}[v]||v||"—");
  const fmt=v=>v?new Date(v).toLocaleString("bn-BD",{dateStyle:"medium",timeStyle:"short"}):"তথ্য নেই";
  const money=v=>"৳ "+Number(v||0).toFixed(2);
  const el=(tag,cls,txt)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n;};
  const button=(label,action,cls="")=>{const b=el("button","status-button "+cls,label);b.type="button";b.addEventListener("click",()=>Promise.resolve().then(action).catch(e=>message(e.message||"কাজটি সম্পন্ন হয়নি।",true)));return b;};
  function showView(name){document.querySelectorAll(".admin-view").forEach(v=>v.classList.toggle("active",v.id==="view-"+name));document.querySelectorAll(".admin-nav").forEach(v=>v.classList.toggle("active",v.dataset.view===name));}
  document.querySelectorAll(".admin-nav").forEach(b=>b.addEventListener("click",()=>showView(b.dataset.view)));
  document.querySelectorAll("[data-go]").forEach(b=>b.addEventListener("click",()=>showView(b.dataset.go)));
  async function loadMembers(){
    $("members-list").textContent="সদস্য তালিকা লোড হচ্ছে...";
    const {data,error}=await client.rpc("admin_list_members",{p_search:$("member-search").value.trim()});
    if(error)throw error;
    $("member-count").textContent=(data?.length||0)+" জন সদস্য";
    const root=$("members-list");root.replaceChildren();
    if(!data?.length){root.textContent="কোনো সদস্য পাওয়া যায়নি।";return;}
    data.forEach(m=>{
      const card=el("article","member-card"),top=el("div","member-top"),left=el("div","");
      left.append(el("div","member-name",m.full_name||"নাম দেওয়া হয়নি"),el("div","member-email",m.email||"ইমেইল নেই"));
      top.append(left,el("span","role-pill",m.role==="admin"?"ADMIN":"MEMBER"));card.append(top);
      const meta=el("div","member-meta");
      const fields=[["User ID",m.id],["ফোন",m.phone||"দেওয়া হয়নি"],["নিবন্ধন",fmt(m.created_at)],["সর্বশেষ লগইন",fmt(m.last_sign_in_at)]];
      fields.forEach(([label,value])=>{const box=el("div","");box.append(el("small","",label),el("b","",value));meta.append(box);});
      card.append(meta);root.append(card);
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
    const {data,error}=await client.from("withdrawal_requests").select("id,user_id,amount,payout_method,status,created_at").order("created_at",{ascending:false}).limit(100);if(error)throw error;
    const root=$("withdrawals-list");root.replaceChildren();$("stat-withdrawals").textContent=data.filter(x=>x.status==="pending").length;
    if(!data.length){root.textContent="এখনো কোনো উত্তোলনের অনুরোধ নেই।";return;}
    data.forEach(w=>{const row=el("div","admin-row"),info=el("div","admin-row-main");info.append(el("b","",money(w.amount)+" · "+(w.payout_method==="bkash"?"বিকাশ":"নগদ")),el("small","","সদস্য ID: "+w.user_id+" · "+statusBn(w.status)+" · "+fmt(w.created_at)));row.append(info);root.append(row);});
  }
  $("offer-form").addEventListener("submit",async event=>{event.preventDefault();const form=event.currentTarget,data=Object.fromEntries(new FormData(form).entries());try{const url=new URL(data.destination_url);if(!["https:","http:"].includes(url.protocol))throw new Error("শুধু HTTP/HTTPS লিংক ব্যবহার করুন।");$("offer-submit").disabled=true;message("অফার সংরক্ষণ হচ্ছে...");const {error}=await client.from("offers").insert({...data,status:"pending"});if(error)throw error;form.reset();message("অফার সংরক্ষিত হয়েছে। Pending অবস্থায় রাখা হয়েছে।");await loadOffers();}catch(e){message(e.message||"অফার সংরক্ষণ করা যায়নি।",true);}finally{$("offer-submit").disabled=false;}});
  $("refresh-offers").addEventListener("click",()=>loadOffers().catch(e=>message(e.message,true)));
  $("refresh-conversions").addEventListener("click",()=>loadConversions().catch(e=>message(e.message,true)));
  $("refresh-withdrawals").addEventListener("click",()=>loadWithdrawals().catch(e=>message(e.message,true)));
  async function refreshAll(){try{await Promise.all([loadMembers(),loadOffers(),loadConversions(),loadWithdrawals()]);message("সব তথ্য আপডেট হয়েছে।");}catch(e){message(e.message||"তথ্য লোড করা যায়নি।",true);}}
  $("refresh-all").addEventListener("click",refreshAll);
  (async()=>{try{const {data,error}=await client.auth.getSession();if(error)throw error;if(!data.session){location.replace("auth.html");return;}const {data:profile,error:pe}=await client.from("profiles").select("role").eq("id",data.session.user.id).single();if(pe)throw pe;if(profile?.role!=="admin"){location.replace("dashboard.html");return;}
    $("admin-top").hidden=false;$("admin-content").hidden=false;$("admin-footer").hidden=false;message("অ্যাডমিন যাচাই সফল।");await refreshAll();
  }catch(e){message(e.message||"অ্যাডমিন প্যানেল লোড করা যায়নি।",true);}})();
})();