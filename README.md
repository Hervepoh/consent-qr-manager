# 📘 Eneo QR Consent - Guide d'Administration Technique

Ce document est destiné aux administrateurs système et au **NOC** pour la gestion, la surveillance et la maintenance de l'application de collecte de consentements clients.

---

## 🏗️ Architecture du Système

L'application est entièrement conteneurisée via **Docker Compose** et repose sur 5 services interconnectés :

1.  **`consent-frontend`** (Nginx) : Sert l'application React et fait office de reverse-proxy.
2.  **`consent-server`** (Node.js/Express) : Cœur de l'application (API, Logique métier, Envoi OTP).
3.  **`consent-db`** (MySQL 8) : Stockage persistant des consentements et des files d'attente.
4.  **`consent-monitor`** (Dozzle) : Interface web pour la lecture des logs en temps réel.
5.  **`consent-uptime`** (Uptime Kuma) : Dashboard de santé et alertes pour le NOC.

---

## 🚀 Commandes Opérationnelles (Cheatsheet)

### Démarrage et Mise à jour
```bash
# Lancer l'application complète (mode détaché)
docker compose up -d

# Mettre à jour l'application après un changement de code
docker compose up -d --build server frontend

# Arrêter l'application
docker compose down
```

### Surveillance
```bash
# Voir l'état des conteneurs, CPU et RAM
docker stats

# Voir les logs en ligne de commande
docker compose logs -f server
```

---

## 📊 Monitoring & Observabilité (NOC)

| Service | Accès | Fonction |
| :--- | :--- | :--- |
| **Dozzle** | `http://<IP_SERVEUR>:8888` | **Logs en temps réel**. Recherche rapide par numéro de contrat ou téléphone. |
| **Uptime Kuma** | `http://<IP_SERVEUR>:3002` | **Dashboard NOC**. Statut UP/DOWN, Latence, Historique des pannes. |

> [!TIP]
> **Identifiants Uptime Kuma** :
> - Utilisateur : `admin`
> - Mot de passe : voir `.env` (À modifier au premier lancement)

---

## 🗄️ Gestion de la Base de Données

### Accès Sécurisé (Tunnel SSH)
Le port MySQL (**3306**) n'est pas exposé sur Internet. Pour y accéder avec un outil comme DBeaver :
1.  Utilisez un **Tunnel SSH** vers l'IP du serveur.
2.  Hôte local : `127.0.0.1` | Port : `3308` (mappé vers 3306 interne).
3.  Utilisateur : `consent_user` | Pass :  (voir `.env`).

### Schéma & Tables Clés
*   **`consents`** : Stocke les validations finales des clients.
*   **`sms_queue` / `mail_queue`** : Files d'attente pour les envois. Consultez les colonnes `last_error` et `provider_response` pour diagnostiquer les échecs d'envoi.
*   **`otp_throttle`** : Gère le blocage temporaire des fraudeurs (anti-brute-force).

---

## 🛡️ Sécurité & Résilience

### Hardening (Durcissement)
*   **Rotation des logs** : Docker est configuré pour limiter chaque log à 3 fichiers de 10Mo.
*   **Rate Limiting** : 
    *   **Send OTP** : Max 3 envois par session.
    *   **Verify OTP** : Max 5 tentatives avant blocage de 5 min (exponentiel).
*   **Isolation** : Les conteneurs tournent avec des privilèges réduits (`no-new-privileges`).

### Retry Mechanism
Le serveur possède un système de "Retry" automatique :
*   Si un SMS échoue (timeout), il est retenté immédiatement une fois.
*   S'il échoue encore, il reste en `pending` dans la file et sera traité par le **Cron job** toutes les 5 minutes.

---

## 🛠️ Dépannage (Troubleshooting)

**Q : Le client ne reçoit pas de SMS.**
1. Ouvrez **Dozzle** (`:8888`).
2. Cherchez le numéro du client.
3. Vérifiez s'il y a une erreur `MTARGET API Error` ou `Network Timeout`.
4. Vérifiez le solde du compte SMS via l'API Provider.

**Q : L'application répond "Forbidden: Session contact mismatch".**
*   C'est une protection de sécurité. Le client doit recommencer le processus depuis le début s'il change de numéro de téléphone en cours de route.

**Q : Le serveur est lent.**
*   Lancez `docker stats`. Si la RAM du service `server` dépasse 512Mo, redémarrez-le : `docker compose restart server`.

---

## 💾 Sauvegardes
Il est recommandé d'exécuter un dump SQL quotidiennement :
```bash
docker exec consent-db mysqldump -u root -pRootPass123! consent_manager > backup_$(date +%F).sql
```
