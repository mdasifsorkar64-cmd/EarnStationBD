(() => {
 const client = window.supabase.createClient(window.EARNSTATION_SUPABASE_URL, window.EARNSTATION_SUPABASE_PUBLISHABLE_KEY);
 const emailEl = document.getElementById("member-email");
 const logout = document.getElementById("logout-button");
 client.auth.getSession().then(({ data, error }) => {
   if (error || !data.session) { window.location.replace("auth.html"); return; }
   emailEl.textContent = data.session.user.email || "সদস্য অ্যাকাউন্ট";
 });
 client.auth.onAuthStateChange((_event, session) => {
   if (!session) window.location.replace("auth.html");
 });
 logout.addEventListener("click", async () => {
   logout.disabled = true;
   const { error } = await client.auth.signOut();
   if (error) { alert("লগআউট হয়নি: " + error.message); logout.disabled = false; }
   else window.location.replace("auth.html");
 });
})();