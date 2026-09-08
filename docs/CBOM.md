# GLYX — inventário criptográfico (CBOM)

> Gerado por `lib/security/crypto-inventory.test.ts` a cada `npm run verify`.
> Fonte no código, artefato gerado — não editar à mão.

| primitiva | usos | onde |
|---|---:|---|
| `sha256` | 8 | lib/auth/constant-time.ts:18<br>lib/auth/constant-time.ts:19<br>lib/cgm/dexcom.ts:47<br>lib/cgm/dexcom.ts:62<br>lib/cgm/librelinkup.ts:32<br>lib/cgm/librelinkup.ts:255 |
| `timingSafeEqual` | 7 | lib/auth/constant-time.ts:1<br>lib/auth/constant-time.ts:9<br>lib/auth/constant-time.ts:20<br>lib/cgm/dexcom.ts:1<br>lib/cgm/dexcom.ts:66<br>lib/health/google-fit-oauth.ts:1 |
| `aes-256-gcm` | 2 | lib/cgm/librelinkup.ts:275<br>lib/cgm/librelinkup.ts:285 |
| `hkdfSync` | 2 | lib/cgm/librelinkup.ts:1<br>lib/cgm/librelinkup.ts:250 |
| `randomBytes` | 2 | lib/cgm/librelinkup.ts:1<br>lib/cgm/librelinkup.ts:274 |
| `randomUUID` | 1 | lib/storage/upload-private-photo.ts:44 |

## O que o detector reprova

- **MD5** — colisão prática desde 2004
- **SHA-1** — colisão prática desde 2017
- **HMAC-MD5 / HMAC-SHA1** — hash subjacente quebrado
- **DES / 3DES** — chave curta demais
- **RC4** — quebrado
- **Modo ECB** — vaza padrão do texto claro
- **createCipher legado** — sem IV e com derivação obsoleta; depreciado no Node
- **Cifra sem AEAD** — texto cifrado alterável sem a decifra perceber
- **Chave de cifra derivada por hash simples** — use HKDF ou scrypt
- **Comparação de segredo com `===`** — vaza prefixo correto pelo tempo

## O que ele não cobre

Dependências de terceiro (o `package-lock.json` não é varrido aqui),
TLS na borda, e criptografia do lado do Supabase. O escopo é o código
deste repositório.

---

**Riva's Alexandre**  © 2026
Todos os direitos reservados.
