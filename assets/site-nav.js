(() => {
  const header = document.querySelector("header");
  const nav = header?.querySelector(".site-nav");
  if (!header || !nav) return;
  if (header.querySelector(".nav-toggle")) return;

  nav.id = nav.id || "site-nav";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "nav-toggle";
  btn.setAttribute("aria-expanded", "false");
  btn.setAttribute("aria-controls", nav.id);
  btn.innerHTML = '<span class="nav-toggle-bars" aria-hidden="true"></span><span class="nav-toggle-label">Menu</span>';
  header.insertBefore(btn, nav);

  const scrim = document.createElement("button");
  scrim.type = "button";
  scrim.className = "nav-scrim";
  scrim.setAttribute("aria-label", "Close menu");
  scrim.hidden = true;
  header.insertAdjacentElement("afterend", scrim);

  const desktop = window.matchMedia("(min-width: 861px)");

  const syncHeaderHeight = () => {
    document.documentElement.style.setProperty("--header-h", `${header.offsetHeight}px`);
  };

  const setOpen = (open) => {
    if (desktop.matches) open = false;
    header.classList.toggle("is-nav-open", open);
    btn.setAttribute("aria-expanded", String(open));
    btn.querySelector(".nav-toggle-label").textContent = open ? "Close" : "Menu";
    document.body.classList.toggle("nav-lock", open);
    scrim.hidden = !open;
    syncHeaderHeight();
  };

  btn.addEventListener("click", () => setOpen(!header.classList.contains("is-nav-open")));
  scrim.addEventListener("click", () => setOpen(false));
  nav.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => setOpen(false)));
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setOpen(false);
  });
  desktop.addEventListener("change", () => setOpen(false));
  window.addEventListener("resize", syncHeaderHeight, { passive: true });
  syncHeaderHeight();
})();
