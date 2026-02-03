#!/usr/bin/env node
// send-newsletter.mjs
// Usage: node send-newsletter.mjs --subject "Tytuł" --html newsletter.html [--test email@test.pl]

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  GetCommand,
} from "@aws-sdk/lib-dynamodb";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { readFileSync } from "fs";
import { parseArgs } from "util";

// Config
const TABLE_NAME = "1copywriting-newsletter";
const FROM_EMAIL = "newsletter@1copywriting.pl";

const dynamoClient = new DynamoDBClient({ region: "eu-central-1" });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const sesClient = new SESClient({ region: "us-east-1" });

// Parse CLI arguments
const { values } = parseArgs({
  options: {
    subject: { type: "string", short: "s" },
    html: { type: "string", short: "h" },
    test: { type: "string", short: "t" },
    help: { type: "boolean" },
  },
});

if (values.help || !values.subject || !values.html) {
  console.log(`
📧 Newsletter Sender for 1copywriting.pl

Usage:
  node send-newsletter.mjs --subject "Tytuł" --html newsletter.html
  node send-newsletter.mjs -s "Tytuł" -h newsletter.html --test karol@torweb.pl

Options:
  -s, --subject   Email subject (required)
  -h, --html      Path to HTML file (required)
  -t, --test      Send only to this email (for testing)
  --help          Show this help

Example newsletter.html structure:
  See newsletter-template.html for a starter template
`);
  process.exit(0);
}

// Get all confirmed subscribers
async function getSubscribers() {
  const result = await docClient.send(
    new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: "confirmed = :confirmed",
      ExpressionAttributeValues: { ":confirmed": true },
    }),
  );
  return result.Items || [];
}

// Get single subscriber by email
async function getSubscriberByEmail(email) {
  const result = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { email: email.toLowerCase().trim() },
    }),
  );
  return result.Item || null;
}

// Generate unsubscribe link
function getUnsubscribeUrl(email, token) {
  return `https://rasyigegbd.execute-api.eu-central-1.amazonaws.com/prod/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`;
}

// Add unsubscribe footer to HTML
function addUnsubscribeFooter(html, email, token) {
  const unsubscribeUrl = getUnsubscribeUrl(email, token);
  const footer = `
    <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e5e5; font-size: 13px; color: #888; text-align: center;">
      <p>Otrzymujesz ten email, bo zapisałeś się na newsletter 1copywriting.pl</p>
      <p><a href="${unsubscribeUrl}" style="color: #888;">Wypisz się z newslettera</a></p>
    </div>
  `;

  // Insert before </body> or at the end
  if (html.includes("</body>")) {
    return html.replace("</body>", `${footer}</body>`);
  }
  return html + footer;
}

// Send email to one subscriber
async function sendEmail(subscriber, subject, htmlTemplate) {
  const { email, token, name } = subscriber;

  // Personalize HTML
  let html = htmlTemplate
    .replace(/\{\{email\}\}/g, email)
    .replace(/\{\{name\}\}/g, name || "")
    .replace(/\{\{greeting\}\}/g, name ? `Cześć ${name}!` : "Cześć!");

  // Add unsubscribe footer
  html = addUnsubscribeFooter(html, email, token);

  // Plain text version
  const text = `${subject}\n\nAby zobaczyć pełną wersję, otwórz email w przeglądarce.\n\nWypisz się: ${getUnsubscribeUrl(email, token)}`;

  await sesClient.send(
    new SendEmailCommand({
      Source: FROM_EMAIL,
      Destination: { ToAddresses: [email] },
      Message: {
        Subject: { Data: subject, Charset: "UTF-8" },
        Body: {
          Html: { Data: html, Charset: "UTF-8" },
          Text: { Data: text, Charset: "UTF-8" },
        },
      },
    }),
  );
}

// Main
async function main() {
  const { subject, html: htmlPath, test } = values;

  // Read HTML template
  let htmlTemplate;
  try {
    htmlTemplate = readFileSync(htmlPath, "utf-8");
  } catch (e) {
    console.error(`❌ Nie można odczytać pliku: ${htmlPath}`);
    process.exit(1);
  }

  // Get recipients
  let recipients;
  if (test) {
    // Test mode - try to get real subscriber data for working unsubscribe link
    console.log(`\n🧪 TRYB TESTOWY - wysyłka tylko do: ${test}\n`);

    const testSubscriber = await getSubscriberByEmail(test);
    if (testSubscriber) {
      recipients = [testSubscriber];
      console.log(`   ✓ Znaleziono w bazie - link wypisania będzie działać\n`);
    } else {
      // Email not in DB - use dummy token (unsubscribe won't work)
      recipients = [
        { email: test, token: "test-token-unsubscribe-disabled", name: "" },
      ];
      console.log(
        `   ⚠ Email nie jest w bazie - link wypisania NIE będzie działać\n`,
      );
    }
  } else {
    recipients = await getSubscribers();
    console.log(
      `\n📋 Znaleziono ${recipients.length} potwierdzonych subskrybentów\n`,
    );

    if (recipients.length === 0) {
      console.log("Brak subskrybentów do wysyłki.");
      process.exit(0);
    }

    // Confirmation
    console.log(`Temat: "${subject}"`);
    console.log(`Szablon: ${htmlPath}`);
    console.log(
      `\nCzy na pewno chcesz wysłać newsletter do ${recipients.length} osób?`,
    );
    console.log('Wpisz "TAK" aby kontynuować:');

    const readline = await import("readline");
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const answer = await new Promise((resolve) => {
      rl.question("> ", resolve);
    });
    rl.close();

    if (answer !== "TAK") {
      console.log("\n❌ Wysyłka anulowana.");
      process.exit(0);
    }
  }

  // Send emails
  console.log("\n📧 Wysyłanie...\n");

  let sent = 0;
  let failed = 0;

  for (const subscriber of recipients) {
    try {
      await sendEmail(subscriber, subject, htmlTemplate);
      sent++;
      console.log(`  ✓ ${subscriber.email}`);

      // Rate limiting - SES allows 14/sec, we'll do 10/sec to be safe
      if (!test) {
        await new Promise((r) => setTimeout(r, 100));
      }
    } catch (e) {
      failed++;
      console.error(`  ✗ ${subscriber.email}: ${e.message}`);
    }
  }

  console.log(`\n✅ Wysłano: ${sent}`);
  if (failed > 0) {
    console.log(`❌ Błędy: ${failed}`);
  }
}

main().catch(console.error);
