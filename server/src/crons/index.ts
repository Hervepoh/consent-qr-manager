// crons/index.ts
import cron from 'node-cron';
import { SMSService } from '../services/sms.service';

export function registerCrons() {
    // ⏱ SMS Retry toutes les 2 minutes
    cron.schedule('*/2 * * * *', async () => {
        console.log('[CRON] 🔄 SMS retry queue...');
        await SMSService.processPendingQueue();
    });

    // 🗑 Nettoyage le 1er de chaque mois à 3h du matin
    cron.schedule('0 3 1 * *', async () => {
        console.log('[CRON] 🗑️ SMS cleanup...');
        await SMSService.cleanupSentMessages();
    });
}