# 📧 Newsletter 1copywriting.pl — Dokumentacja

System newslettera oparty na AWS (Lambda + DynamoDB + SES + API Gateway).  
Koszt: praktycznie $0 przy małej liście (free tier).

---

## Spis treści

1. [Architektura systemu](#1-architektura-systemu)
2. [Zasoby AWS](#2-zasoby-aws)
3. [Pliki projektu](#3-pliki-projektu)
4. [Formularz zapisu (frontend)](#4-formularz-zapisu-frontend)
5. [Zarządzanie subskrybentami](#5-zarządzanie-subskrybentami)
6. [Wysyłanie newsletterów](#6-wysyłanie-newsletterów)
7. [Szablony email](#7-szablony-email)
8. [Powiadomienia Slack](#8-powiadomienia-slack)
9. [Troubleshooting](#9-troubleshooting)
10. [Koszty](#10-koszty)
11. [GDPR / RODO](#11-gdpr--rodo)
12. [Backup i bezpieczeństwo](#12-backup-i-bezpieczeństwo)

---

## 1. Architektura systemu

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           ZAPIS NA NEWSLETTER                           │
└─────────────────────────────────────────────────────────────────────────┘

  [Użytkownik]
       │
       │ 1. Wpisuje email w formularzu
       ▼
  ┌─────────────┐     POST /subscribe      ┌─────────────────┐
  │   Strona    │ ───────────────────────► │  API Gateway    │
  │   (Astro)   │                          │  (HTTP API)     │
  └─────────────┘                          └────────┬────────┘
                                                    │
                                                    ▼
                                           ┌─────────────────┐
                                           │     Lambda      │
                                           │  (Node.js 20)   │
                                           └────────┬────────┘
                                                    │
                          ┌─────────────────────────┼─────────────────────────┐
                          │                         │                         │
                          ▼                         ▼                         ▼
                   ┌─────────────┐          ┌─────────────┐          ┌─────────────┐
                   │  DynamoDB   │          │     SES     │          │    Slack    │
                   │  (storage)  │          │   (email)   │          │  (webhook)  │
                   └─────────────┘          └──────┬──────┘          └─────────────┘
                                                   │
                                                   │ 2. Email z linkiem
                                                   ▼
                                            [Użytkownik]
                                                   │
                                                   │ 3. Klika "Potwierdzam"
                                                   ▼
                                           GET /confirm?token=...
                                                   │
                                                   ▼
                                           ┌─────────────────┐
                                           │     Lambda      │ ──► Slack: "Nowy subskrybent!"
                                           └────────┬────────┘
                                                    │
                                                    │ 4. confirmed = true
                                                    ▼
                                           ┌─────────────────┐
                                           │    DynamoDB     │
                                           └─────────────────┘
                                                    │
                                                    │ 5. Redirect
                                                    ▼
                                           /newsletter/potwierdzono/


┌─────────────────────────────────────────────────────────────────────────┐
│                         WYSYŁKA NEWSLETTERA                             │
└─────────────────────────────────────────────────────────────────────────┘

  [Admin]
       │
       │ node send-newsletter.mjs --subject "..." --html template.html
       ▼
  ┌─────────────┐                          ┌─────────────────┐
  │   Skrypt    │ ────── Scan ───────────► │    DynamoDB     │
  │   Node.js   │ ◄─── Lista emails ────── │  (subskrybenci) │
  └──────┬──────┘                          └─────────────────┘
         │
         │ Dla każdego subskrybenta:
         ▼
  ┌─────────────┐
  │     SES     │ ────────────────────────► [Email do subskrybenta]
  │  (us-east-1)│
  └─────────────┘
```

### Przepływ danych (Double Opt-in)

1. **Zapis** → Użytkownik wpisuje email → Lambda zapisuje do DynamoDB (`confirmed: false`) → SES wysyła email z linkiem
2. **Potwierdzenie** → Użytkownik klika link → Lambda ustawia `confirmed: true` → Slack notification
3. **Wysyłka** → Admin uruchamia skrypt → Pobiera z DynamoDB gdzie `confirmed: true` → SES wysyła do każdego

---

## 2. Zasoby AWS

### API Gateway (HTTP API)

| Parametr | Wartość                                                          |
| -------- | ---------------------------------------------------------------- |
| Nazwa    | `1copywriting-newsletter-api`                                    |
| ID       | `rasyigegbd`                                                     |
| Region   | `eu-central-1`                                                   |
| Endpoint | `https://rasyigegbd.execute-api.eu-central-1.amazonaws.com/prod` |

**Endpointy:**

| Metoda | Ścieżka        | Opis                                 |
| ------ | -------------- | ------------------------------------ |
| `POST` | `/subscribe`   | Zapis nowego subskrybenta            |
| `GET`  | `/confirm`     | Potwierdzenie zapisu (link z emaila) |
| `GET`  | `/unsubscribe` | Wypisanie z newslettera              |

### Lambda

| Parametr | Wartość                   |
| -------- | ------------------------- |
| Nazwa    | `1copywriting-newsletter` |
| Runtime  | Node.js 20.x              |
| Handler  | `index.handler`           |
| Region   | `eu-central-1`            |
| Timeout  | 30 sekund                 |
| Pamięć   | 256 MB                    |

**Zmienne środowiskowe:**

| Zmienna         | Wartość                                                          |
| --------------- | ---------------------------------------------------------------- |
| `API_URL`       | `https://rasyigegbd.execute-api.eu-central-1.amazonaws.com/prod` |
| `SLACK_WEBHOOK` | `https://hooks.slack.com/services/...`                           |

### DynamoDB

| Parametr      | Wartość                     |
| ------------- | --------------------------- |
| Nazwa tabeli  | `1copywriting-newsletter`   |
| Region        | `eu-central-1`              |
| Partition Key | `email` (String)            |
| Billing       | On-demand (pay per request) |

**Struktura rekordu:**

```json
{
  "email": "user@example.com",
  "name": "Jan",
  "token": "abc123...",
  "confirmed": true,
  "createdAt": "2026-02-03T14:30:00.000Z",
  "confirmedAt": "2026-02-03T14:35:00.000Z",
  "updatedAt": "2026-02-03T14:35:00.000Z"
}
```

### SES (Simple Email Service)

| Parametr      | Wartość                           |
| ------------- | --------------------------------- |
| Region        | `us-east-1` (produkcja)           |
| Domena        | `1copywriting.pl` (zweryfikowana) |
| Email nadawcy | `newsletter@1copywriting.pl`      |
| Status        | Production (bez limitu sandbox)   |
| Limit         | 50,000 emaili/24h, 14/sek         |

### IAM Role

| Parametr    | Wartość                                           |
| ----------- | ------------------------------------------------- |
| Nazwa       | `1copywriting-newsletter-role`                    |
| Uprawnienia | DynamoDB (CRUD), SES (SendEmail), CloudWatch Logs |

---

## 3. Pliki projektu

### Struktura katalogów

```
D:\1copywriting.pl\
├── src/
│   ├── components/
│   │   └── Newsletter.astro        # Formularz zapisu
│   └── pages/
│       └── newsletter/
│           ├── potwierdzono.astro  # Strona sukcesu
│           ├── wypisano.astro      # Strona wypisu
│           └── blad.astro          # Strona błędu
│
├── newsletter-lambda/
│   └── index.mjs                   # Kod Lambda (do deploymentu)
│
├── newsletter-admin/               # Narzędzia admina
│   ├── package.json
│   ├── send-newsletter.mjs         # Skrypt wysyłki
│   ├── list-subscribers.mjs        # Lista subskrybentów
│   └── newsletter-template.html    # Szablon emaila
│
├── lambda-policy.json              # IAM policy
├── trust-policy.json               # IAM trust policy
└── newsletter-lambda.zip           # Spakowana Lambda
```

### Mapowanie plików

| Plik źródłowy                 | Docelowa lokalizacja                             |
| ----------------------------- | ------------------------------------------------ |
| `Newsletter.astro`            | `src/components/Newsletter.astro`                |
| `potwierdzono.astro`          | `src/pages/newsletter/potwierdzono.astro`        |
| `wypisano.astro`              | `src/pages/newsletter/wypisano.astro`            |
| `blad.astro`                  | `src/pages/newsletter/blad.astro`                |
| `newsletter-lambda/index.mjs` | Lambda (przez `aws lambda update-function-code`) |

---

## 4. Formularz zapisu (frontend)

### Komponent Newsletter.astro

Trzy warianty użycia:

```astro
<!-- Banner (na stronie głównej) -->
<Newsletter variant="banner" />

<!-- Inline (w artykułach) -->
<Newsletter variant="inline" />

<!-- Sidebar (w bocznym panelu) -->
<Newsletter variant="sidebar" />
```

### Konfiguracja endpointu

W pliku `src/components/Newsletter.astro` na początku:

```javascript
const API_ENDPOINT =
  "https://rasyigegbd.execute-api.eu-central-1.amazonaws.com/prod";
```

### Strony statusu

| URL                         | Opis                                 |
| --------------------------- | ------------------------------------ |
| `/newsletter/potwierdzono/` | Po kliknięciu linku potwierdzającego |
| `/newsletter/wypisano/`     | Po kliknięciu "Wypisz się"           |
| `/newsletter/blad/`         | Gdy link jest nieprawidłowy/wygasł   |

---

## 5. Zarządzanie subskrybentami

### Setup narzędzi admina

```bash
cd newsletter-admin
npm install
```

### Lista subskrybentów

```bash
# Tylko potwierdzeni (gotowi do wysyłki)
node list-subscribers.mjs

# Wszyscy (też niepotwierdzeni)
node list-subscribers.mjs --all
```

**Przykładowy output:**

```
📋 Subskrybenci newsletter 1copywriting.pl
   (tylko potwierdzeni)

────────────────────────────────────────────────────────────
✓ karol@torweb.pl
  Zapisany: 03.02.2026, potwierdzony: 03.02.2026
✓ jan@example.com (Jan)
  Zapisany: 02.02.2026, potwierdzony: 02.02.2026
────────────────────────────────────────────────────────────

Razem: 2 potwierdzonych
```

### Bezpośredni dostęp do DynamoDB (AWS CLI)

```bash
# Wszystkie rekordy
aws dynamodb scan --table-name 1copywriting-newsletter --region eu-central-1

# Tylko potwierdzone
aws dynamodb scan \
  --table-name 1copywriting-newsletter \
  --filter-expression "confirmed = :c" \
  --expression-attribute-values '{":c":{"BOOL":true}}' \
  --region eu-central-1

# Eksport do CSV
aws dynamodb scan \
  --table-name 1copywriting-newsletter \
  --region eu-central-1 \
  --query "Items[?confirmed.BOOL==\`true\`].[email.S]" \
  --output text > subscribers.csv
```

### Ręczne usunięcie subskrybenta

```bash
aws dynamodb delete-item \
  --table-name 1copywriting-newsletter \
  --key '{"email":{"S":"user@example.com"}}' \
  --region eu-central-1
```

---

## 6. Wysyłanie newsletterów

### Krok 1: Przygotuj treść

Edytuj `newsletter-template.html` lub stwórz nowy plik HTML.

**Dostępne zmienne (placeholder'y):**

| Zmienna        | Opis                 | Przykład                  |
| -------------- | -------------------- | ------------------------- |
| `{{greeting}}` | Powitanie z imieniem | "Cześć Jan!" lub "Cześć!" |
| `{{name}}`     | Samo imię            | "Jan" lub ""              |
| `{{email}}`    | Adres email          | "jan@example.com"         |

**Przykład użycia w HTML:**

```html
<p class="greeting">{{greeting}}</p>
<p>Twój email: {{email}}</p>
```

### Krok 2: Test na sobie

**ZAWSZE** najpierw wyślij testowo:

```bash
node send-newsletter.mjs \
  --subject "Newsletter #1 - Tytuł" \
  --html newsletter-template.html \
  --test karol@torweb.pl
```

Sprawdź:

- Czy email dotarł
- Czy wygląda dobrze (desktop + mobile)
- Czy link "Wypisz się" działa
- Czy personalizacja działa (jeśli użyta)

### Krok 3: Wysyłka do wszystkich

```bash
node send-newsletter.mjs \
  --subject "Newsletter #1 - Tytuł" \
  --html newsletter-template.html
```

**Output:**

```
📋 Znaleziono 150 potwierdzonych subskrybentów

Temat: "Newsletter #1 - Tytuł"
Szablon: newsletter-template.html

Czy na pewno chcesz wysłać newsletter do 150 osób?
Wpisz "TAK" aby kontynuować:
> TAK

📧 Wysyłanie...

  ✓ jan@example.com
  ✓ anna@example.com
  ✓ piotr@example.com
  ...

✅ Wysłano: 150
```

### Opcje skryptu wysyłki

```bash
node send-newsletter.mjs --help

📧 Newsletter Sender for 1copywriting.pl

Usage:
  node send-newsletter.mjs --subject "Tytuł" --html newsletter.html
  node send-newsletter.mjs -s "Tytuł" -h newsletter.html --test email@test.pl

Options:
  -s, --subject   Temat emaila (wymagany)
  -h, --html      Ścieżka do pliku HTML (wymagany)
  -t, --test      Wyślij tylko do tego adresu (tryb testowy)
  --help          Pokaż pomoc
```

### Rate limiting

- SES limit: 14 emaili/sek
- Skrypt wysyła ~10/sek (100ms przerwy)
- 1000 subskrybentów = ~2 minuty
- 10000 subskrybentów = ~17 minut

---

## 7. Szablony email

### Struktura szablonu

```html
<!DOCTYPE html>
<html lang="pl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Newsletter 1copywriting.pl</title>
    <style>
      /* Style inline - kompatybilność z klientami email */
    </style>
  </head>
  <body>
    <div class="wrapper">
      <div class="container">
        <!-- Header z logo -->
        <div class="header">
          <div class="logo"><span>1</span>copywriting.pl</div>
        </div>

        <!-- Treść -->
        <div class="content">
          <p class="greeting">{{greeting}}</p>

          <!-- Twoja treść tutaj -->
        </div>

        <!-- Footer - link wypisania dodawany automatycznie -->
        <div class="footer">
          <p>1copywriting.pl</p>
        </div>
      </div>
    </div>
  </body>
</html>
```

### Komponenty do wykorzystania

**Wyróżniony box:**

```html
<div class="highlight">
  <p><strong>Ważne:</strong> Treść wyróżniona</p>
</div>
```

**Przycisk CTA:**

```html
<div class="btn-container">
  <a href="https://..." class="btn">Tekst przycisku →</a>
</div>
```

**Karta artykułu:**

```html
<div class="article">
  <div class="article-title">
    <a href="https://...">Tytuł artykułu</a>
  </div>
  <p class="article-desc">Krótki opis artykułu.</p>
</div>
```

### Automatyczny footer

Skrypt `send-newsletter.mjs` automatycznie dodaje przed `</body>`:

```html
<div style="...">
  <p>Otrzymujesz ten email, bo zapisałeś się na newsletter 1copywriting.pl</p>
  <p>
    <a href="https://.../unsubscribe?email=...&token=..."
      >Wypisz się z newslettera</a
    >
  </p>
</div>
```

**Nie musisz tego dodawać ręcznie!**

---

## 8. Powiadomienia Slack

### Konfiguracja

Webhook URL jest ustawiony jako zmienna środowiskowa Lambda:

```
SLACK_WEBHOOK=https://hooks.slack.com/services/T0J1FUC93/B0ACH750H4K/...
```

### Kiedy otrzymujesz powiadomienie

| Zdarzenie                          | Wiadomość Slack                                                             |
| ---------------------------------- | --------------------------------------------------------------------------- |
| Nowy subskrybent potwierdził zapis | 🎉 Nowy subskrybent newsletter 1copywriting.pl!<br>📧 jan@example.com (Jan) |
| Ktoś się wypisał                   | 👋 Ktoś wypisał się z newslettera 1copywriting.pl<br>📧 jan@example.com     |

### Zmiana kanału Slack

1. Idź do https://api.slack.com/apps
2. Wybierz aplikację "powiadomienia"
3. **Incoming Webhooks** → **Add New Webhook to Workspace**
4. Wybierz nowy kanał
5. Skopiuj nowy URL
6. Zaktualizuj Lambda:

```bash
aws lambda update-function-configuration \
  --function-name 1copywriting-newsletter \
  --environment "Variables={API_URL=https://rasyigegbd.execute-api.eu-central-1.amazonaws.com/prod,SLACK_WEBHOOK=https://hooks.slack.com/services/NOWY/WEBHOOK/URL}" \
  --region eu-central-1
```

---

## 9. Troubleshooting

### Logi Lambda

```bash
# Ostatnie 5 minut
MSYS_NO_PATHCONV=1 aws logs tail /aws/lambda/1copywriting-newsletter --region eu-central-1 --since 5m

# Śledzenie na żywo
MSYS_NO_PATHCONV=1 aws logs tail /aws/lambda/1copywriting-newsletter --region eu-central-1 --follow
```

Lub w AWS Console:  
https://eu-central-1.console.aws.amazon.com/cloudwatch/home?region=eu-central-1#logsV2:log-groups/log-group/$252Faws$252Flambda$252F1copywriting-newsletter

### Częste błędy

#### "Not found" przy zapisie

**Przyczyna:** Routing nie działa  
**Rozwiązanie:** Sprawdź czy `event.rawPath` jest używany przed `event.path` w `index.mjs`

#### "Email address is not verified"

**Przyczyna:** Domena nie zweryfikowana w SES lub zły region  
**Rozwiązanie:**

1. Sprawdź region SES w Lambda (powinien być `us-east-1`)
2. Zweryfikuj domenę: `aws ses get-identity-verification-attributes --identities 1copywriting.pl --region us-east-1`

#### "Internal server error"

**Przyczyna:** Błąd w Lambda  
**Rozwiązanie:** Sprawdź logi CloudWatch

#### Email nie dochodzi

**Przyczyny:**

1. Spam folder
2. SES w sandbox mode (tylko zweryfikowane adresy)
3. Błędna konfiguracja DKIM/SPF

**Sprawdzenie:**

```bash
# Status SES
aws ses get-account-sending-enabled --region us-east-1

# Weryfikacja domeny
aws ses get-identity-dkim-attributes --identities 1copywriting.pl --region us-east-1
```

#### CORS error w przeglądarce

**Przyczyna:** Zły origin w nagłówkach  
**Rozwiązanie:** Sprawdź czy w `index.mjs`:

```javascript
'Access-Control-Allow-Origin': 'https://www.1copywriting.pl'
```

### Aktualizacja kodu Lambda

```bash
cd newsletter-lambda
zip -r ../newsletter-lambda.zip index.mjs
cd ..

aws lambda update-function-code \
  --function-name 1copywriting-newsletter \
  --zip-file fileb://newsletter-lambda.zip \
  --region eu-central-1
```

### Testowanie API

```bash
# Test zapisu
curl -X POST https://rasyigegbd.execute-api.eu-central-1.amazonaws.com/prod/subscribe \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","name":"Test"}'

# Test potwierdzenia (w przeglądarce)
https://rasyigegbd.execute-api.eu-central-1.amazonaws.com/prod/confirm?email=test@example.com&token=...
```

---

## 10. Koszty

### Free tier (12 miesięcy)

| Usługa      | Darmowy limit                     |
| ----------- | --------------------------------- |
| Lambda      | 1M requestów/mies, 400,000 GB-sek |
| API Gateway | 1M requestów/mies                 |
| DynamoDB    | 25 GB storage, 25 RCU/WCU         |
| SES         | 62,000 emaili/mies (z EC2)        |

### Po free tier

| Usługa      | Koszt                    |
| ----------- | ------------------------ |
| Lambda      | ~$0.20 / 1M requestów    |
| API Gateway | ~$1.00 / 1M requestów    |
| DynamoDB    | ~$0.25 / 1M requestów    |
| SES         | **$0.10 / 1,000 emaili** |

### Przykładowe koszty miesięczne

| Scenariusz | Subskrybenci | Wysyłki/mies | Koszt  |
| ---------- | ------------ | ------------ | ------ |
| Start      | 100          | 4            | ~$0.04 |
| Rozwój     | 1,000        | 4            | ~$0.40 |
| Duży       | 10,000       | 4            | ~$4.00 |

**Dominujący koszt to SES ($0.10/1000 emaili).**

---

## 11. GDPR / RODO

### Zgodność systemu

| Wymóg RODO                 | Realizacja                           |
| -------------------------- | ------------------------------------ |
| Świadoma zgoda             | Double opt-in (email potwierdzający) |
| Prawo do usunięcia         | Link "Wypisz się" w każdym emailu    |
| Minimalizacja danych       | Tylko email, opcjonalnie imię        |
| Bezpieczeństwo             | Dane w AWS (szyfrowanie, compliance) |
| Informacja o przetwarzaniu | Polityka prywatności na stronie      |

### Przechowywane dane

```json
{
  "email": "user@example.com",
  "name": "Jan", // opcjonalne
  "token": "...", // do weryfikacji
  "confirmed": true,
  "createdAt": "...",
  "confirmedAt": "..."
}
```

### Link do polityki prywatności

W formularzu Newsletter.astro:

```html
<p class="newsletter__privacy">
  Zapisując się, akceptujesz naszą
  <a href="/polityka-prywatnosci/">politykę prywatności</a>. Możesz wypisać się
  w każdej chwili.
</p>
```

### Obsługa żądań RODO

**Usunięcie danych na żądanie:**

```bash
aws dynamodb delete-item \
  --table-name 1copywriting-newsletter \
  --key '{"email":{"S":"user@example.com"}}' \
  --region eu-central-1
```

**Eksport danych użytkownika:**

```bash
aws dynamodb get-item \
  --table-name 1copywriting-newsletter \
  --key '{"email":{"S":"user@example.com"}}' \
  --region eu-central-1
```

---

## 12. Backup i bezpieczeństwo

### Automatyczny backup DynamoDB

DynamoDB ma wbudowany Point-in-Time Recovery (PITR). Włączenie:

```bash
aws dynamodb update-continuous-backups \
  --table-name 1copywriting-newsletter \
  --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true \
  --region eu-central-1
```

### Ręczny eksport listy

```bash
# Do JSON
aws dynamodb scan \
  --table-name 1copywriting-newsletter \
  --region eu-central-1 \
  > backup-$(date +%Y%m%d).json

# Tylko emaile potwierdzonych (CSV)
aws dynamodb scan \
  --table-name 1copywriting-newsletter \
  --filter-expression "confirmed = :c" \
  --expression-attribute-values '{":c":{"BOOL":true}}' \
  --region eu-central-1 \
  --query "Items[*].email.S" \
  --output text | tr '\t' '\n' > subscribers-$(date +%Y%m%d).csv
```

### Bezpieczeństwo

| Aspekt            | Zabezpieczenie                                |
| ----------------- | --------------------------------------------- |
| Dane w spoczynku  | DynamoDB encryption at rest                   |
| Dane w transmisji | HTTPS (TLS 1.2+)                              |
| Dostęp do API     | CORS (tylko z 1copywriting.pl)                |
| Token wypisania   | Losowy 64-znakowy hex                         |
| IAM               | Least privilege (tylko potrzebne uprawnienia) |

### Rotacja Slack Webhook

Jeśli webhook wycieknie:

1. W Slack App → **Incoming Webhooks** → usuń stary webhook
2. Dodaj nowy webhook
3. Zaktualizuj Lambda (patrz sekcja 8)

---

## Szybka ściągawka

```bash
# === ZARZĄDZANIE ===

# Lista subskrybentów
cd newsletter-admin && node list-subscribers.mjs

# === WYSYŁKA ===

# Test
node send-newsletter.mjs -s "Tytuł" -h template.html --test karol@torweb.pl

# Produkcja
node send-newsletter.mjs -s "Tytuł" -h template.html

# === DEBUG ===

# Logi Lambda
MSYS_NO_PATHCONV=1 aws logs tail /aws/lambda/1copywriting-newsletter --region eu-central-1 --since 5m

# Test API
curl -X POST https://rasyigegbd.execute-api.eu-central-1.amazonaws.com/prod/subscribe \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.pl"}'

# === AKTUALIZACJA KODU ===

cd newsletter-lambda
zip -r ../newsletter-lambda.zip index.mjs
cd ..
aws lambda update-function-code \
  --function-name 1copywriting-newsletter \
  --zip-file fileb://newsletter-lambda.zip \
  --region eu-central-1
```

---

**Dokumentacja aktualna na dzień: 3 lutego 2026**  
**Wersja systemu: 1.0**
