// utils/cron-lock.ts
import { db } from '../db';
import { cronLocks } from '../db/schema';
import { eq } from 'drizzle-orm';

export class CronLock {
  /**
   * Tente d'acquérir un lock
   * @param name     identifiant du cron
   * @param ttlMs    durée max du lock (sécurité anti-deadlock)
   * @returns true si le lock est acquis
   */
  static async acquire(name: string, ttlMs: number = 5 * 60 * 1000): Promise<boolean> {
    const now = new Date();
    const lockedUntil = new Date(now.getTime() + ttlMs);

    try {
      // INSERT OR FAIL — atomique grâce à la PRIMARY KEY
      // Si la ligne existe déjà → exception → lock non acquis
      await db.insert(cronLocks).values({
        name,
        lockedAt: now,
        lockedUntil,
      });

      return true; // ✅ Lock acquis
    } catch {
      // La ligne existe — vérifier si le lock est expiré (anti-deadlock)
      const existing = await db.query.cronLocks.findFirst({
        where: eq(cronLocks.name, name),
      });

      if (!existing || existing.lockedUntil < now) {
        // Lock expiré — on force la reprise
        await db.update(cronLocks)
          .set({ lockedAt: now, lockedUntil })
          .where(eq(cronLocks.name, name));

        console.warn(`[CRON LOCK] ⚠️ Lock expiré sur "${name}", repris`);
        return true;
      }

      return false; // 🔒 Lock actif détenu par un autre process
    }
  }

  /**
   * Libère le lock
   */
  static async release(name: string): Promise<void> {
    await db.delete(cronLocks).where(eq(cronLocks.name, name));
  }
}