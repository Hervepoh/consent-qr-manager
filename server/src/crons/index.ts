// crons/index.ts
import cron from 'node-cron';
import { db } from '../db';
import { cronLocks } from '../db/schema';
import { eq } from 'drizzle-orm';
import { SMSService } from '../services/sms.service';
import { MailService } from '../services/mail.service';

/**
 * [FORTRESS] Verrou de sécurité pour éviter le chevauchement des crons.
 * Utilise la DB pour la synchronisation (persistant même après redémarrage).
 */
async function withLock(name: string, ttlSeconds: number, task: () => Promise<void>) {
    const now = new Date();
    const lockedUntil = new Date(now.getTime() + ttlSeconds * 1000);

    try {
        const [lock] = await db.select().from(cronLocks).where(eq(cronLocks.name, name));

        if (lock && lock.lockedUntil > now) {
            return;
        }

        if (!lock) {
            await db.insert(cronLocks).values({
                name,
                lockedAt: now,
                lockedUntil
            });
        } else {
            await db.update(cronLocks)
                .set({ lockedAt: now, lockedUntil })
                .where(eq(cronLocks.name, name));
        }

        await task();

        await db.update(cronLocks)
            .set({ lockedUntil: new Date(Date.now() - 1000) }) // expire maintenant (1s dans le passé)
            .where(eq(cronLocks.name, name));

    } catch (error) {
        console.error(`[CRON LOCK ERROR] ${name}:`, error);
    }
}

export function registerCrons() {
    // ⏱ SMS Retry toutes les 2 minutes
    cron.schedule('*/2 * * * *', async () => {
        await withLock('sms_retry', 110, async () => {
            console.log('[CRON] 🔄 SMS retry queue...');
            await SMSService.processPendingQueue();
        });
    });

    // ⏱ Mail Retry toutes les 2 minutes
    cron.schedule('*/2 * * * *', async () => {
        await withLock('mail_retry', 280, async () => {
            console.log('[CRON] 🔄 Mail retry queue...');
            await MailService.processPendingQueue();
        });
    });

    // 🗑 Nettoyage le 1er de chaque mois à 3h du matin
    cron.schedule('0 3 1 * *', async () => {
        await withLock('cleanup', 3600, async () => {
            console.log('[CRON] 🗑️ Cleanup logs...');
            await SMSService.cleanupSentMessages();
            await MailService.cleanupSentMessages();
        });
    });
}