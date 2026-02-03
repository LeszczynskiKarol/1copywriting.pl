#!/usr/bin/env node
// list-subscribers.mjs
// Usage: node list-subscribers.mjs [--all]

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";

const TABLE_NAME = "1copywriting-newsletter";
const dynamoClient = new DynamoDBClient({ region: "eu-central-1" });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const showAll = process.argv.includes("--all");

async function listSubscribers() {
  const result = await docClient.send(
    new ScanCommand({
      TableName: TABLE_NAME,
      ...(showAll ? {} : {
        FilterExpression: "confirmed = :confirmed",
        ExpressionAttributeValues: { ":confirmed": true },
      }),
    })
  );

  const items = result.Items || [];

  console.log(`\n📋 Subskrybenci newsletter 1copywriting.pl`);
  console.log(`   ${showAll ? "(wszystkie)" : "(tylko potwierdzeni)"}\n`);
  console.log("─".repeat(60));

  if (items.length === 0) {
    console.log("Brak subskrybentów.");
    return;
  }

  // Sort by date
  items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  items.forEach((item, i) => {
    const status = item.confirmed ? "✓" : "○";
    const date = new Date(item.createdAt).toLocaleDateString("pl-PL");
    const name = item.name ? ` (${item.name})` : "";
    console.log(`${status} ${item.email}${name}`);
    console.log(`  Zapisany: ${date}${item.confirmed ? `, potwierdzony: ${new Date(item.confirmedAt).toLocaleDateString("pl-PL")}` : ""}`);
  });

  console.log("─".repeat(60));
  console.log(`\nRazem: ${items.length} ${showAll ? "" : "potwierdzonych"}`);
  
  if (!showAll) {
    console.log(`\nUżyj --all aby zobaczyć też niepotwierdzonych.`);
  }
}

listSubscribers().catch(console.error);
