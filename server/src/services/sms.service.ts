// services/sms.service.ts
import { db } from '../db';
import { smsQueue } from '../db/schema';
import { eq, and, lte, lt } from 'drizzle-orm';

export class SMSService {
  private static readonly SMS_API_URL = "https://api-public.mtarget.fr/messages";
  private static readonly USERNAME = process.env.SMS_USERNAME ?? "eneo";
  private static readonly PASSWORD = process.env.SMS_PASSWORD ?? "CA2ah0o9y6JQ";
  private static readonly SENDER = "Eneo";
  private static readonly MAX_ATTEMPTS = 5;

  // ─── Normalisation du numéro ────────────────────────────────────────────────
  private static formatPhone(phone: string): string {
    // Supprime espaces, tirets, parenthèses
    let cleaned = phone.replace(/[\s\-().]/g, "");

    // Déjà au bon format
    if (cleaned.startsWith("+237")) return cleaned;

    // Commence par 237 sans le +
    if (cleaned.startsWith("237")) return "+" + cleaned;

    // Numéro local camerounais (6XX ou 2XX — 9 chiffres)
    if (/^[62]\d{8}$/.test(cleaned)) return "+237" + cleaned;

    // Fallback — ajoute juste le +
    if (!cleaned.startsWith("+")) cleaned = "+" + cleaned;
    return cleaned;
  }

  // ─── Appel réel à l'API mtarget ─────────────────────────────────────────────
  private static async callAPI(phone: string, message: string): Promise<{ success: boolean; response?: string; error?: string }> {
    const formattedPhone = this.formatPhone(phone);
    const urlencoded = new URLSearchParams();
    urlencoded.append("username", this.USERNAME);
    urlencoded.append("password", this.PASSWORD);
    urlencoded.append("msisdn", formattedPhone);
    urlencoded.append("msg", message);
    urlencoded.append("sender", this.SENDER);

    // Tentative avec retry immédiat (max 2 essais) pour gérer les ConnectTimeout passagers
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await fetch(this.SMS_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Cookie": "SERVERID=B",
          },
          body: urlencoded,
          signal: AbortSignal.timeout(30_000), // timeout 30s
        });

        const result = await response.text();
        
        if (!response.ok) {
          if (attempt === 1) continue; 
          return { success: false, response: result, error: `HTTP ${response.status}` };
        }

        const parsed = JSON.parse(result);
        const smsResult = parsed?.results?.[0];

        const success = smsResult?.code === "0" || smsResult?.code === 0;
        if (success) return { success: true, response: result };
        
        if (attempt === 1) continue; 
        return { success: false, response: result, error: "API Error Code" };
      } catch (err: any) {
        if (attempt === 1) {
          console.warn(`[SMS] ⚠️ Tentative ${attempt} échouée (timeout/réseau), nouvel essai...`);
          continue;
        }
        console.error(`[SMS] 🔥 Erreur réseau persistante après ${attempt} essais:`, err);
        return { success: false, error: err?.message || "Unknown Network Error" };
      }
    }
    return { success: false, error: "Retries exhausted" };
  }

  // ─── Calcul du délai de retry exponentiel ───────────────────────────────────
  private static retryDelay(attempts: number): Date {
    // 1m, 2m, 3m, 5m, 10m
    const delays = [1, 2, 3, 5, 10];
    const minutes = delays[Math.min(attempts, delays.length - 1)];
    return new Date(Date.now() + minutes * 60 * 1000);
  }

  // ─── PUBLIC: stocker + tenter l'envoi immédiatement ─────────────────────────
  static async sendOTP(phone: string, code: string): Promise<{ queued: boolean; sent: boolean }> {
    const message = `Votre code OTP est ${code}. Il expire dans 5 minutes.`;
    const formattedPhone = this.formatPhone(phone);

    // 1. Stocker en base avec status "pending"
    const [inserted] = await db.insert(smsQueue).values({
      phone: formattedPhone,
      message,
      status: 'pending',
      attempts: 0,
      maxAttempts: this.MAX_ATTEMPTS,
    });

    const queueId = Number(inserted.insertId ?? (inserted as any).lastInsertRowid);
    console.log(`[SMS] 📥 Queued SMS #${queueId} for ${formattedPhone}`);

    // 2. Tenter l'envoi immédiat
    try {
      const result = await this.callAPI(formattedPhone, message);

      if (result.success) {
        // ✅ Envoi réussi → update status sent
        await db.update(smsQueue)
          .set({ 
            status: 'sent', 
            sentAt: new Date(), 
            lastAttemptAt: new Date(), 
            attempts: 1,
            providerResponse: result.response
          })
          .where(eq(smsQueue.id, queueId));

        console.log(`[SMS] ✅ SMS #${queueId} envoyé immédiatement`);
        return { queued: true, sent: true };
      } else {
        // ❌ Échec → planifier retry
        await db.update(smsQueue)
          .set({
            attempts: 1,
            lastAttemptAt: new Date(),
            scheduledFor: this.retryDelay(1),
            providerResponse: result.response,
            lastError: result.error
          })
          .where(eq(smsQueue.id, queueId));

        console.warn(`[SMS] ⚠️ SMS #${queueId} en attente de retry: ${result.error}`);
        return { queued: true, sent: false };
      }
    } catch (err: any) {
      // Erreur inattendue
      await db.update(smsQueue)
        .set({ 
          attempts: 1, 
          lastAttemptAt: new Date(), 
          scheduledFor: this.retryDelay(1),
          lastError: err?.message
        })
        .where(eq(smsQueue.id, queueId));

      console.error(`[SMS] 🔥 Erreur critique pour #${queueId}:`, err);
      return { queued: true, sent: false };
    }
  }

  // ─── CRON: retry tous les SMS pending/failed non encore envoyés ──────────────
  static async processPendingQueue(): Promise<void> {
    const now = new Date();

    const pending = await db.select()
      .from(smsQueue)
      .where(
        and(
          eq(smsQueue.status, 'pending'),
          lte(smsQueue.scheduledFor, now),
          lt(smsQueue.attempts, smsQueue.maxAttempts),
        )
      )
      .limit(50); // traiter par batch

    if (pending.length === 0) {
      console.log('[SMS CRON] ✅ Aucun SMS en attente');
      return;
    }

    console.log(`[SMS CRON] 🔄 Traitement de ${pending.length} SMS en attente...`);

    for (const sms of pending) {
      try {
        const result = await this.callAPI(sms.phone, sms.message);
        const newAttempts = sms.attempts + 1;

        if (result.success) {
          await db.update(smsQueue)
            .set({ 
              status: 'sent', 
              sentAt: new Date(), 
              lastAttemptAt: new Date(), 
              attempts: newAttempts,
              providerResponse: result.response,
              lastError: null
            })
            .where(eq(smsQueue.id, sms.id));
          console.log(`[SMS CRON] ✅ SMS #${sms.id} envoyé (tentative ${newAttempts})`);
        } else {
          const isMaxed = newAttempts >= sms.maxAttempts;
          await db.update(smsQueue)
            .set({
              attempts: newAttempts,
              lastAttemptAt: new Date(),
              status: isMaxed ? 'failed' : 'pending',
              scheduledFor: isMaxed ? null : this.retryDelay(newAttempts),
              providerResponse: result.response,
              lastError: result.error
            })
            .where(eq(smsQueue.id, sms.id));

          if (isMaxed) {
            console.error(`[SMS CRON] 💀 SMS #${sms.id} abandonné après ${newAttempts} tentatives: ${result.error}`);
          }
        }
      } catch (err: any) {
        console.error(`[SMS CRON] 🔥 Erreur pour SMS #${sms.id}:`, err);
      }
    }
  }

  // ─── CRON NETTOYAGE: supprimer les SMS envoyés de plus d'un mois ─────────────
  static async cleanupSentMessages(): Promise<void> {
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    const result = await db.delete(smsQueue)
      .where(
        and(
          eq(smsQueue.status, 'sent'),
          lte(smsQueue.sentAt, oneMonthAgo),
        )
      );

    console.log(`[SMS CLEANUP] 🗑️ SMS supprimés: ${(result as any).affectedRows ?? '?'}`);
  }
}