# ZenBilling Business Microservice

Microservice métier principal pour la gestion des entreprises, clients, factures, devis et produits de la plateforme ZenBilling.

## 📋 Fonctionnalités

### 🏢 Gestion des Entreprises
- CRUD complet des entreprises
- Paramètres et configuration par entreprise
- Génération automatique des numéros de factures et devis
- Statistiques et tableau de bord
- Multi-tenant avec isolation complète

### 👥 Gestion des Clients
- Clients particuliers et entreprises
- Informations complètes (contact, adresse, conditions de paiement)
- Système de tags et catégorisation
- Historique des interactions
- Gestion des crédits et limites

### 📄 Gestion des Factures
- Création et modification de factures
- Gestion des statuts (brouillon, envoyée, payée, en retard)
- Calculs automatiques (TVA, remises, totaux)
- Historique des paiements
- Actions en lot
- Export multi-formats

### 💰 Gestion des Devis
- Création et suivi des devis
- Gestion de la validité
- Conversion automatique en factures
- Workflow d'approbation
- Statistiques de conversion

### 📦 Gestion des Produits
- Catalogue produits complet
- Gestion des stocks et inventaire
- Calculs de marges automatiques
- Catégorisation et étiquetage
- Alertes de stock bas
- Import/export en masse

## 🏗 Architecture

### Stack Technique
- **Runtime**: Node.js 18+ avec TypeScript
- **Framework**: Express.js avec middlewares sécurisés
- **Base de données**: PostgreSQL avec Prisma ORM
- **Cache**: Redis pour les performances
- **Authentification**: Supabase Auth
- **Validation**: Zod pour la validation des schémas
- **Logging**: Pino pour les logs structurés
- **Monitoring**: Health checks et métriques Prometheus

### Structure du Code
```
src/
├── app.ts                 # Application Express principale
├── controllers/           # Contrôleurs API REST
├── services/             # Logique métier
├── interfaces/           # Types TypeScript
├── middlewares/          # Middlewares Express
├── routes/              # Définition des routes
├── lib/                 # Services externes (DB, cache, auth)
├── utils/               # Utilitaires (logging, erreurs, réponses)
├── validations/         # Schémas de validation Zod
└── templates/           # Templates pour exports
```

## 🚀 Installation et Démarrage

### Prérequis
- Node.js 18+
- Docker et Docker Compose
- Git

### Installation Locale

1. **Cloner le repository**
```bash
git clone <repository-url>
cd business-microservice
```

2. **Installer les dépendances**
```bash
npm install
```

3. **Configuration de l'environnement**
```bash
cp .env.example .env
# Éditer le fichier .env avec vos configurations
```

4. **Démarrer les services avec Docker Compose**
```bash
docker-compose up -d business-postgres business-redis
```

5. **Appliquer les migrations**
```bash
npx prisma db push
npx prisma generate
```

6. **Démarrer en mode développement**
```bash
npm run dev
```

### Démarrage avec Docker

1. **Démarrer tous les services**
```bash
docker-compose up -d
```

2. **Avec les outils de développement**
```bash
docker-compose --profile tools up -d
```

## 🔧 Configuration

### Variables d'Environnement Principales

```bash
# Application
NODE_ENV=development
PORT=3001

# Base de données
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/zenbilling_business

# Cache Redis
REDIS_URL=redis://:redis123@localhost:6380

# Authentification Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# JWT
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=24h

# CORS
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3002
```

## 📚 API Documentation

### Endpoints Principaux

| Endpoint | Description |
|----------|-------------|
| `GET /api/companies` | Lister les entreprises |
| `POST /api/companies` | Créer une entreprise |
| `GET /api/customers` | Lister les clients |
| `POST /api/customers` | Créer un client |
| `GET /api/invoices` | Lister les factures |
| `POST /api/invoices` | Créer une facture |
| `GET /api/quotes` | Lister les devis |
| `POST /api/quotes` | Créer un devis |
| `GET /api/products` | Lister les produits |
| `POST /api/products` | Créer un produit |

### Authentification

Toutes les routes API nécessitent un token d'authentification Supabase :

```bash
Authorization: Bearer <supabase-jwt-token>
```

### Permissions et Rôles

- **ADMIN**: Accès complet à toutes les fonctionnalités
- **MANAGER**: Gestion complète de l'entreprise
- **ACCOUNTANT**: Gestion financière (factures, devis, paiements)
- **SALES**: Gestion commerciale (clients, devis)
- **USER**: Consultation et opérations limitées
- **READONLY**: Consultation uniquement

## 🧪 Tests

```bash
# Tests unitaires
npm run test

# Tests d'intégration
npm run test:integration

# Coverage
npm run test:coverage

# Tests avec watch
npm run test:watch
```

## 📊 Monitoring et Debugging

### Health Checks
- `GET /health` - Santé globale du service
- `GET /api/health/detailed` - Santé détaillée avec dépendances
- `GET /api/health/ready` - Readiness probe pour Kubernetes
- `GET /api/health/live` - Liveness probe pour Kubernetes

### Métriques Prometheus
- `GET /api/health/metrics` - Métriques au format Prometheus

### Dashboards de Développement
- **Redis Commander**: http://localhost:8082 (admin/admin)
- **PgAdmin**: http://localhost:8083 (admin@zenbilling.com/admin)
- **Bull Board**: http://localhost:3001/admin/queues

### Logs
Les logs sont structurés en JSON avec Pino :
```bash
# Voir les logs en temps réel
docker-compose logs -f business-service

# Logs avec jq pour le formatage
docker-compose logs business-service | jq
```

## 🔐 Sécurité

### Mesures Implémentées
- **Helmet.js** pour les headers de sécurité
- **Rate limiting** pour prévenir les abus
- **Validation stricte** avec Zod
- **Authentification JWT** avec Supabase
- **Autorisation basée sur les rôles**
- **Isolation multi-tenant**
- **Chiffrement des données sensibles**

### Bonnes Pratiques
- Rotation régulière des secrets
- Monitoring des accès suspects
- Audit trail complet
- Backup chiffré des données

## 🚢 Déploiement

### Production Docker
```bash
# Build de l'image
docker build -t zenbilling/business-microservice:latest .

# Déploiement
docker-compose -f docker-compose.prod.yml up -d
```

### Variables d'Environnement Production
```bash
NODE_ENV=production
LOG_LEVEL=warn
RATE_LIMIT_MAX_REQUESTS=100
```

## 🤝 Contribution

### Standards de Code
- ESLint + Prettier configurés
- Commits conventionnels
- Tests obligatoires pour les nouvelles fonctionnalités
- Documentation à jour

### Workflow
1. Fork du repository
2. Branche feature depuis `develop`
3. Tests et validation
4. Pull Request vers `develop`
5. Review et merge

## 📄 License

MIT License - voir le fichier LICENSE pour plus de détails.

---

## 🔗 Services Connexes

- **Notification Microservice**: Gestion des emails et notifications
- **Payment Microservice**: Traitement des paiements Stripe
- **Frontend ZenBilling**: Interface utilisateur React

## 📞 Support

Pour le support technique, créer une issue sur le repository GitHub avec :
- Description du problème
- Logs d'erreur
- Étapes pour reproduire
- Environnement (dev/staging/prod)

---

*ZenBilling Business Microservice - Développé avec ❤️ par l'équipe ZenBilling* 