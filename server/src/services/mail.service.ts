import ejs from "ejs";
import path from "path";
import nodemailer from "nodemailer";
import { db } from "../db";
import { mailQueue } from "../db/schema";
import { eq, and, lte, lt } from "drizzle-orm";

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    service: process.env.SMTP_SERVICE,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

export interface MailInterface {
    to: string;
    name: string;
    url?: string;
    dashboardUrl?: string;
    [key: string]: any;
}

export class MailService {

    // ─── Rendu du template EJS ───────────────────────────────────────────────────
    private static async renderTemplate(
        templateName: string,
        data: MailInterface
    ): Promise<string> {
        const templatePath = path.join(process.cwd(), "mail", "templates", `${templateName}.ejs`);
        const baseUrl = process.env.FRONTEND_URL || "";

        return new Promise((resolve, reject) => {
            ejs.renderFile(templatePath, { ...data, baseUrl }, (err: any, html: string) => {
                if (err) {
                    console.error("[MAIL] Erreur template:", err, "path:", templatePath);
                    reject(err);
                } else {
                    resolve(html);
                }
            });
        });
    }

    // ─── Appel réel SMTP ─────────────────────────────────────────────────────────
    private static async callSMTP(
        to: string,
        subject: string,
        html: string
    ): Promise<boolean> {
        try {
            await transporter.sendMail({
                from: `"Eneo" <${process.env.SMTP_USER}>`,
                to,
                subject,
                html,
            });
            return true;
        } catch (error) {
            console.error("[MAIL] Erreur SMTP:", error);
            return false;
        }
    }

    // ─── Retry exponentiel (identique à SMSService) ───────────────────────────
    private static retryDelay(attempts: number): Date {
        const delays = [1, 5, 15, 30, 60]; // minutes
        const minutes = delays[Math.min(attempts, delays.length - 1)];
        return new Date(Date.now() + minutes * 60 * 1000);
    }

    // ─── PUBLIC: stocker + envoyer immédiatement ─────────────────────────────────
    static async sendOTP(data: MailInterface, code: string): Promise<{ queued: boolean; sent: boolean }> {
        return this.send('otp', `Votre code OTP`, { ...data, code });
    }

    static async sendWelcome(data: MailInterface): Promise<{ queued: boolean; sent: boolean }> {
        return this.send('welcome', `Bienvenue ${data.name}`, data);
    }

    // Méthode générique — utilisez celle-ci pour tout nouveau template
    static async send(
        templateName: string,
        subject: string,
        data: MailInterface
    ): Promise<{ queued: boolean; sent: boolean }> {

        // 1. Rendre le template AVANT de stocker (fail rapide si template manquant)
        let html: string;
        try {
            html = await this.renderTemplate(templateName, data);
        } catch (err) {
            console.error(`[MAIL] ❌ Template "${templateName}" introuvable`);
            return { queued: false, sent: false };
        }

        // 2. Stocker en base
        const [inserted] = await db.insert(mailQueue).values({
            to: data.to,
            subject,
            templateName,
            templateData: JSON.stringify(data), // pour retry
            status: 'pending',
            attempts: 0,
            maxAttempts: 5,
        });

        const queueId = Number((inserted as any).insertId);
        console.log(`[MAIL] 📥 Mail #${queueId} queued → ${data.to}`);

        // 3. Tentative d'envoi immédiat
        try {
            const success = await this.callSMTP(data.to, subject, html);

            if (success) {
                await db.update(mailQueue)
                    .set({ status: 'sent', sentAt: new Date(), lastAttemptAt: new Date(), attempts: 1 })
                    .where(eq(mailQueue.id, queueId));

                console.log(`[MAIL] ✅ Mail #${queueId} envoyé à ${data.to}`);
                return { queued: true, sent: true };
            } else {
                await db.update(mailQueue)
                    .set({ attempts: 1, lastAttemptAt: new Date(), scheduledFor: this.retryDelay(1) })
                    .where(eq(mailQueue.id, queueId));

                console.warn(`[MAIL] ⚠️ Mail #${queueId} en attente de retry`);
                return { queued: true, sent: false };
            }
        } catch (err) {
            await db.update(mailQueue)
                .set({ attempts: 1, lastAttemptAt: new Date(), scheduledFor: this.retryDelay(1) })
                .where(eq(mailQueue.id, queueId));

            console.error(`[MAIL] 🔥 Erreur réseau #${queueId}:`, err);
            return { queued: true, sent: false };
        }
    }

    // ─── CRON: retry les mails pending ───────────────────────────────────────────
    static async processPendingQueue(): Promise<void> {
        const now = new Date();

        // ─── 1. Trouver les 50 IDs à traiter ────────────────────────────────────────
        const pending = await db.select()
            .from(mailQueue)
            .where(
                and(
                    eq(mailQueue.status, 'pending'),
                    lte(mailQueue.scheduledFor, now),
                    lt(mailQueue.attempts, mailQueue.maxAttempts),
                )
            )
            .limit(50);

        if (pending.length === 0) {
            console.log('[MAIL CRON] ✅ Aucun mail en attente');
            return;
        }

        console.log(`[MAIL CRON] 🔄 ${pending.length} mail(s) à traiter...`);

        for (const mail of pending) {
            try {
                // Re-render le template avec les données stockées
                const data: MailInterface = JSON.parse(mail.templateData);
                const html = await this.renderTemplate(mail.templateName, data);
                const success = await this.callSMTP(mail.to, mail.subject, html);
                const newAttempts = mail.attempts + 1;

                if (success) {
                    await db.update(mailQueue)
                        .set({ status: 'sent', sentAt: new Date(), lastAttemptAt: new Date(), attempts: newAttempts })
                        .where(eq(mailQueue.id, mail.id));
                    console.log(`[MAIL CRON] ✅ Mail #${mail.id} envoyé (tentative ${newAttempts})`);
                } else {
                    const isMaxed = newAttempts >= mail.maxAttempts;
                    await db.update(mailQueue)
                        .set({
                            attempts: newAttempts,
                            lastAttemptAt: new Date(),
                            status: isMaxed ? 'failed' : 'pending',
                            scheduledFor: isMaxed ? null : this.retryDelay(newAttempts),
                        })
                        .where(eq(mailQueue.id, mail.id));

                    if (isMaxed) {
                        console.error(`[MAIL CRON] 💀 Mail #${mail.id} abandonné après ${newAttempts} tentatives`);
                    }
                }
            } catch (err) {
                console.error(`[MAIL CRON] 🔥 Erreur mail #${mail.id}:`, err);
            }
        }
    }

    // ─── CRON NETTOYAGE: supprimer les mails envoyés > 1 mois ───────────────────
    static async cleanupSentMessages(): Promise<void> {
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

        const result = await db.delete(mailQueue)
            .where(
                and(
                    eq(mailQueue.status, 'sent'),
                    lte(mailQueue.sentAt, oneMonthAgo),
                )
            );

        console.log(`[MAIL CLEANUP] 🗑️ Mails supprimés: ${(result as any).affectedRows ?? '?'}`);
    }
}