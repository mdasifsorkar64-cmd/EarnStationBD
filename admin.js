(() => {
  const client = window.supabase.createClient(window.EARNSTATION_SUPABASE_URL, window.EARNSTATION_SUPABASE_PUBLISHABLE_KEY);
  const $ = id => document.getElementById(id);
  const message = (text, error=false) => { $("admin-message").textContent=text; $("admin-message").className="admin-message"+(error?" error":""); };
  const safe = value => String(value ?? "");
  const statusBn = value => ({pending:"অপেক্ষমাণ",active:"সক্রিয়",paused:"স্থগিত",rejected:"বাতিল",approved:"অনুমোদিত"}[value] || value);
  const button = (label, action, className="") => {
    const el=document.createElement("button"); el.type="button"; el.className="status-button "+className; el.textContent=label; el.addEventListener("click",()=>Promise.resolve().then(action).catch(error=>message(error.message||"কাজটি সম্পন্ন হয়নি।",true))); return el;
  };
  async function loadOffers() {
    $("offers-table").textContent="লোড হচ্ছে...";
    const {data,error}=await client.from("offers").select("id,title,partner_name,status,destination_url,created_at").order("created_at",{ascending:false}).limit(100);
    if(error) throw error;
    const root=$("offers-table"); root.replaceChildren();
    if(!data.length){root.textContent="এখনো কোনো অফার যোগ করা হয়নি।";return;}
    data.forEach(item=>{
      const row=document.createElement("div");row.className="admin-row";
      const info=document.createElement("div");info.className="admin-row-main";
      const name=document.createElement("b");name.textContent=item.title;info.append(name);
      const meta=document.createElement("small");meta.textContent=item.partner_name+" · "+statusBn(item.status);info.append(meta);
      row.append(info);
      const actions=document.createElement("div");actions.className="admin-row-actions";
      ["active","paused","rejected"].forEach(status=>{
        const actionButton=button(status==="active"?"সক্রিয় · ট্র্যাকিং অপেক্ষমাণ":statusBn(status),async()=>{
          if(status==="active") return;
          await changeOffer(item.id,status);
        },status);
        if(status==="active"){actionButton.disabled=true;actionButton.title="সদস্যভিত্তিক ক্লিক ট্র্যাকিং ও পার্টনার পোস্টব্যাক যুক্ত না হওয়া পর্যন্ত সক্রিয় করা যাবে না";}
        actions.append(actionButton);
      });
      row.append(actions);root.append(row);
    });
  }
  async function changeOffer(id,status){
    message("অফারের অবস্থা আপডেট হচ্ছে...");
    const {error}=await client.from("offers").update({status}).eq("id",id);
    if(error) throw error;
    message("অফারের অবস্থা আপডেট হয়েছে।"); await loadOffers();
  }
  async function loadConversions(){
    $("conversions-list").textContent="লোড হচ্ছে...";
    const {data,error}=await client.from("partner_conversions").select("id,partner_name,external_conversion_id,commission_amount,status,received_at").order("received_at",{ascending:false}).limit(100);
    if(error) throw error;
    const root=$("conversions-list");root.replaceChildren();
    if(!data.length){root.textContent="এখনো কোনো পার্টনার কনভার্সন আসেনি।";return;}
    data.forEach(item=>{
      const row=document.createElement("div");row.className="admin-row";
      const info=document.createElement("div");info.className="admin-row-main";
      const name=document.createElement("b");name.textContent=item.partner_name+" · ৳ "+Number(item.commission_amount).toFixed(2);info.append(name);
      const meta=document.createElement("small");meta.textContent="রেফারেন্স: "+item.external_conversion_id+" · "+statusBn(item.status);info.append(meta);
      row.append(info);
      const actions=document.createElement("div");actions.className="admin-row-actions";
      if(item.status==="pending"){
        actions.append(button("অনুমোদন",()=>reviewConversion(item.id,"approved"),"active"));
        actions.append(button("বাতিল",()=>reviewConversion(item.id,"rejected"),"rejected"));
      }
      row.append(actions);root.append(row);
    });
  }
  async function reviewConversion(id,decision){
    const promptText=decision==="approved"?"পার্টনারের রিপোর্টে কনভার্সন যাচাই করেছেন? অনুমোদন করলে কমিশন লেজারে একবার যোগ হবে.":"এই কনভার্সন বাতিল করবেন?";
    if(!confirm(promptText))return;
    message("কনভার্সন পর্যালোচনা হচ্ছে...");
    const {error}=await client.rpc("admin_review_conversion",{p_conversion_id:id,p_decision:decision,p_note:""});
    if(error)throw error;
    message("কনভার্সন পর্যালোচনা সম্পন্ন।");await loadConversions();
  }
  $("offer-form").addEventListener("submit",async event=>{
    event.preventDefault();const form=event.currentTarget;const data=Object.fromEntries(new FormData(form).entries());
    try{
      const url=new URL(data.destination_url);
      if(!["https:","http:"].includes(url.protocol))throw new Error("শুধু HTTP/HTTPS লিংক ব্যবহার করুন।");
      $("offer-submit").disabled=true;message("অফার সংরক্ষণ হচ্ছে...");
      const {error}=await client.from("offers").insert({...data,status:"pending"});
      if(error)throw error;
      form.reset();message("অফার সংরক্ষিত হয়েছে। যাচাই না করা পর্যন্ত Pending থাকবে।");await loadOffers();
    }catch(error){message(error.message||"অফার সংরক্ষণ করা যায়নি।",true);}
    finally{$("offer-submit").disabled=false;}
  });
  $("refresh-offers").addEventListener("click",()=>loadOffers().catch(e=>message(e.message,true)));
  $("refresh-conversions").addEventListener("click",()=>loadConversions().catch(e=>message(e.message,true)));
  (async()=>{
    try{
      const {data,error}=await client.auth.getSession();if(error)throw error;
      if(!data.session){location.replace("auth.html");return;}
      const {data:profile,error:profileError}=await client.from("profiles").select("role").eq("id",data.session.user.id).single();
      if(profileError)throw profileError;
      if(profile?.role!=="admin"){location.replace("dashboard.html");return;}
      $("admin-top").hidden=false;
      $("admin-content").hidden=false;
      $("admin-footer").hidden=false;
      message("অ্যাডমিন যাচাই সফল।");
      await Promise.all([loadOffers(),loadConversions()]);
    }catch(error){message(error.message||"অ্যাডমিন প্যানেল লোড করা যায়নি।",true);}
  })();
})();