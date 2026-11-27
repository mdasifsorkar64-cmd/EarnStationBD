function decodeBase64(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new Error("সার্ভারের এনক্রিপশন কনফিগারেশন সঠিক নয়।");
  }
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function encodeBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function importPayoutKey(encodedKey, usage) {
  const rawKey = decodeBase64(encodedKey || "");
  if (rawKey.length !== 32) throw new Error("সার্ভারের এনক্রিপশন কনফিগারেশন সঠিক নয়।");
  return crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, [usage]);
}

export async function encryptPayoutAccount(account, encodedKey) {
  const key = await importPayoutKey(encodedKey, "encrypt");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, tagLength: 128 },
    key,
    new TextEncoder().encode(String(account))
  ));
  const tag = encrypted.slice(encrypted.length - 16);
  const ciphertext = encrypted.slice(0, encrypted.length - 16);
  const packed = new Uint8Array(28 + ciphertext.length);
  packed.set(iv, 0);
  packed.set(tag, 12);
  packed.set(ciphertext, 28);
  return "v1." + encodeBase64(packed);
}

export async function decryptPayoutAccount(value, encodedKey) {
  const [version, encoded, extra] = String(value || "").split(".");
  if (version !== "v1" || !encoded || extra !== undefined) throw new Error("উত্তোলনের গোপন তথ্য পড়া যায়নি।");
  const packed = decodeBase64(encoded);
  if (packed.length < 29) throw new Error("উত্তোলনের গোপন তথ্য সঠিক নয়।");
  const key = await importPayoutKey(encodedKey, "decrypt");
  const iv = packed.slice(0, 12);
  const tag = packed.slice(12, 28);
  const ciphertext = packed.slice(28);
  const combined = new Uint8Array(ciphertext.length + tag.length);
  combined.set(ciphertext, 0);
  combined.set(tag, ciphertext.length);
  const clear = await crypto.subtle.decrypt({ name: "AES-GCM", iv, tagLength: 128 }, key, combined);
  return new TextDecoder().decode(clear);
}
