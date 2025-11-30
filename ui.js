document.addEventListener("DOMContentLoaded", () => {
  const html      = document.documentElement;
  const themeBtn  = document.getElementById("themeToggle");
  const menuBtn   = document.getElementById("menuBtn");
  const closeBtn  = document.getElementById("closeMenu");
  const sideMenu  = document.getElementById("sideMenu");
  const fechaEl   = document.getElementById("fechaHeader");

  /* FECHA */
  if (fechaEl) {
    const hoy = new Date();
    const txt = hoy.toLocaleDateString("es-PY", {
      weekday:"long", day:"numeric", month:"long"
    });
    fechaEl.textContent = txt.charAt(0).toUpperCase() + txt.slice(1);
  }

  /* MODO OSCURO PERSISTENTE */
  const storedMode = localStorage.getItem("asu_theme");

  function setTemaInicial(){
    if (storedMode) {
      html.setAttribute("data-theme", storedMode);
      return;
    }
    const hora = new Date().getHours();
    const modo = (hora >= 18 || hora < 6) ? "dark" : "light";
    html.setAttribute("data-theme", modo);
  }
  setTemaInicial();

  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      const cur = html.getAttribute("data-theme") || "light";
      const next = cur === "dark" ? "light" : "dark";
      html.setAttribute("data-theme", next);
      localStorage.setItem("asu_theme", next);
    });
  }

  /* MENÚ LATERAL */
  let backdrop = null;
  function createBackdrop(){
    backdrop = document.createElement("div");
    backdrop.style.position = "fixed";
    backdrop.style.top = 0;
    backdrop.style.left = 0;
    backdrop.style.width = "100vw";
    backdrop.style.height = "100vh";
    backdrop.style.background = "rgba(0,0,0,0.2)";
    backdrop.style.zIndex = 1999;
    backdrop.addEventListener("click", closeMenu);
    document.body.appendChild(backdrop);
  }
  function removeBackdrop(){
    if (backdrop) { backdrop.remove(); backdrop = null; }
  }

  function openMenu(){
    sideMenu.classList.add("open");
    createBackdrop();
  }
  function closeMenu(){
    sideMenu.classList.remove("open");
    removeBackdrop();
  }

  if (menuBtn && sideMenu && closeBtn) {
    menuBtn.addEventListener("click", openMenu);
    closeBtn.addEventListener("click", closeMenu);
  }
});
