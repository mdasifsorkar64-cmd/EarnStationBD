(() => {
  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();

  // Public, read-only website settings. All inserted values use textContent.
  async function loadPublicSiteSettings() {
    const url = window.EARNSTATION_SUPABASE_URL;
    const key = window.EARNSTATION_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return;

    try {
      const response = await fetch(url + "/rest/v1/rpc/public_get_site_settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": key,
          "Authorization": "Bearer " + key
        },
        body: "{}"
      });
      if (!response.ok) return;
      const result = await response.json();
      const settings = Array.isArray(result) ? result[0] : result;
      if (!settings) return;

      const siteName = (settings.site_name || "EarnStationBD").trim();
      document.title = siteName + " · " + (settings.site_tagline || "বাস্তব কাজের বাস্তব আয়");

      document.querySelectorAll(".brand").forEach(brand => {
        const label = brand.querySelector("span:nth-child(2)");
        if (label) {
          label.textContent = siteName;
          label.setAttribute("aria-label", siteName);
        }
      });

      const notice = document.querySelector(".notice");
      if (notice && settings.announcement && settings.announcement.trim()) {
        const content = notice.querySelector("div:nth-child(2)");
        if (content) {
          const heading = content.querySelector("b");
          const paragraph = content.querySelector("p");
          if (heading) heading.textContent = "গুরুত্বপূর্ণ ঘোষণা";
          if (paragraph) paragraph.textContent = settings.announcement.trim();
        }
        notice.hidden = false;
      } else if (notice) {
        notice.hidden = true;
      }

      const tagline = document.querySelector(".hero .eyebrow");
      if (tagline && settings.site_tagline) tagline.textContent = settings.site_tagline;

      await loadCommunityLinks(url, key);

      if (settings.contact_email) {
        const footer = document.querySelector(".site-footer .footer-copy");
        if (footer) {
          const contact = document.createElement("a");
          contact.href = "mailto:" + settings.contact_email;
          contact.textContent = "যোগাযোগ: " + settings.contact_email;
          contact.className = "site-contact-link";
          footer.append(document.createElement("br"), contact);
        }
      }
    } catch (error) {
      console.warn("Public site settings could not be loaded.", error);
    }
  }

  async function loadCommunityLinks(url, key) {
    try {
      const response = await fetch(url + "/rest/v1/rpc/public_get_community_links", {
        method: "POST", headers: { "Content-Type": "application/json", apikey: key, Authorization: "Bearer " + key }, body: "{}"
      });
      if (!response.ok) return;
      const rows = await response.json();
      const data = Array.isArray(rows) ? rows[0] : rows;
      if (!data) return;
      const items = [
        ["facebook_url", "Facebook Group", "f"],
        ["telegram_url", "Telegram Group", "➤"],
        ["whatsapp_url", "WhatsApp Group", "◉"],
        ["youtube_url", "YouTube Channel", "▶"]
      ];
      const root = document.getElementById("community-links");
      const section = document.querySelector(".community-section");
      if (!root || !section) return;
      items.forEach(([field, label, symbol]) => {
        const value = (data[field] || "").trim();
        if (!value) return;
        try { const parsed = new URL(value); if (parsed.protocol !== "https:") return; }
        catch (_) { return; }
        const link = document.createElement("a"); link.className = "community-link"; link.href = value; link.target = "_blank"; link.rel = "noopener noreferrer";
        const icon = document.createElement("span"); icon.className = "community-link-icon"; icon.textContent = symbol;
        const title = document.createElement("b"); title.textContent = label;
        const hint = document.createElement("small"); hint.textContent = "গ্রুপে যোগ দিন ↗";
        const text = document.createElement("span"); text.className = "community-link-text"; text.append(title, hint);
        link.append(icon, text); root.append(link);
      });
      if (root.children.length) section.hidden = false;
    } catch (error) { console.warn("Community links could not be loaded.", error); }
  }

  loadPublicSiteSettings();
})();