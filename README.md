# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```



Pour accéder à votre base de données depuis une machine distante en toute sécurité, il ne faut surtout pas ouvrir le port 3306 sur internet.

La solution standard et la plus sécurisée est d'utiliser un Tunnel SSH.

Pourquoi utiliser un Tunnel SSH ?
Le port 3306 reste fermé au monde (lié à 127.0.0.1 comme nous venons de le faire).
Vous passez par votre connexion SSH (déjà sécurisée et cryptée).
C'est comme si votre machine distante était "téléportée" sur le serveur.
Comment faire ?
1. Via la ligne de commande (Terminal)
Depuis votre machine distante (votre PC personnel par exemple), exécutez cette commande :

bash
ssh -L 3307:127.0.0.1:3306 utilisateur@votre-serveur-ip

3307 : C'est le port sur votre machine locale (vous pouvez mettre ce que vous voulez).
127.0.0.1:3306 : C'est la destination sur le serveur (votre base de données).
Une fois connecté en SSH, laissez la fenêtre ouverte.
2. Via un client graphique (DBeaver / MySQL Workbench)
La plupart des outils modernes ont une option "SSH Tunnel" intégrée :

Hôte DB : 127.0.0.1 (et non l'IP du serveur !)
Port DB : 3306
Allez dans l'onglet SSH :
Cochez "Use SSH Tunnel".
Hôte SSH : votre-serveur-ip
Utilisateur : votre-utilisateur-ssh
Méthode d'auth : Votre mot de passe ou votre clé privée .pem / .pub.
Autres alternatives (si vous ne voulez pas de SSH) :
VPN (Wireguard / OpenVPN) : Vous rejoignez le réseau privé du serveur.
Whitelist IP : Si vous avez une IP fixe, vous pouvez configurer votre pare-feu (UFW/Firewalld) pour n'autoriser QUE votre IP sur le port 3306, mais c'est moins flexible qu'un tunnel SSH.
Conseil : Restez sur le Tunnel SSH, c'est la "Règle d'Or" en administration système pour les bases de données.