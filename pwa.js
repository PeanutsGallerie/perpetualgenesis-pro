if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js");
  });
}

let deferredPrompt = null;
const installBtn = document.getElementById("installBtn");

window.addEventListener("beforeinstallprompt", (e) => {
  // Only intercept if we actually have an install button on this page
  if (!installBtn) return;

  e.preventDefault();
  deferredPrompt = e;
  installBtn.style.display = "block";
});

if (installBtn) {
  installBtn.addEventListener("click", async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    deferredPrompt = null;
    installBtn.style.display = "none";
    console.log("Install result:", outcome);
  });
}

window.addEventListener("appinstalled", () => {
  console.log("PWA installed");
  if (installBtn) installBtn.style.display = "none";
});
