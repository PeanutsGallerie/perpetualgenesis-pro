window.importEncryptedAppData = async function (file) {
  // Monetization gate: backup import/export is Pro-only on web
  try {
    if (typeof window.pgRequire === "function") {
      if (!window.pgRequire("exportPrint", "Secure backup restore is available in the Pro app (store version).")) return;
    }
  } catch (e) {}


  const passphrase = prompt("Enter the backup passphrase:");
  if (!passphrase) return;

  const text = await file.text();
  const backup = JSON.parse(text);

  if (
    !backup?.meta ||
    backup.meta.signature !== "PG-SECURE-BACKUP" ||
    !backup.meta.encrypted
  ) {
    alert("Invalid or unsupported backup file.");
    return;
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const salt = base64ToBuffer(backup.salt);
  const iv = base64ToBuffer(backup.iv);
  const encryptedData = base64ToBuffer(backup.data);

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );

  let decrypted;
  try {
    decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      encryptedData
    );
  } catch {
    alert("Incorrect passphrase or corrupted backup.");
    return;
  }

  const restored = JSON.parse(decoder.decode(decrypted));

  localStorage.clear();
  Object.keys(restored).forEach(key => {
    localStorage.setItem(key, restored[key]);
  });

  alert("Backup restored successfully. Reloading app.");
  location.reload();
};



window.exportAppDataEncrypted = async function () {
  // Monetization gate: backup import/export is Pro-only on web
  try {
    if (typeof window.pgRequire === "function") {
      if (!window.pgRequire("exportPrint", "Secure backup download is available in the Pro app (store version).")) return;
    }
  } catch (e) {}


  const passphrase = prompt(
    "Create a passphrase for this backup.\n\n⚠️ If you forget it, this backup CANNOT be restored."
  );

  if (!passphrase) return;

  // Collect ALL localStorage
  const payload = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    payload[key] = localStorage.getItem(key);
  }

  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(payload));

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    data
  );

  const backup = {
    meta: {
      app: "Perpetual Genesis",
      encrypted: true,
      version: "1.0.0",
      exportedAt: new Date().toISOString(),
      signature: "PG-SECURE-BACKUP"
    },
    salt: bufferToBase64(salt),
    iv: bufferToBase64(iv),
    data: bufferToBase64(encrypted)
  };

  const blob = new Blob(
    [JSON.stringify(backup, null, 2)],
    { type: "application/octet-stream" }
  );

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "perpetual-genesis-backup.pgbackup";
  a.click();

  URL.revokeObjectURL(a.href);
};