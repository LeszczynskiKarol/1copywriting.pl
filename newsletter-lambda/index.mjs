// newsletter-lambda/index.mjs
// AWS Lambda function for newsletter management
// Services: DynamoDB (storage), SES (email), API Gateway (HTTP)
// 
// Deploy: zip index.mjs and upload to Lambda
// Runtime: Node.js 20.x
// Handler: index.handler

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, DeleteCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import crypto from 'crypto';

const dynamoClient = new DynamoDBClient({ region: 'eu-central-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const sesClient = new SESClient({ region: 'eu-central-1' });

const TABLE_NAME = '1copywriting-newsletter';
const FROM_EMAIL = 'newsletter@1copywriting.pl';
const SITE_URL = 'https://www.1copywriting.pl';
// API_URL will be set as Lambda environment variable after deployment
const API_URL = process.env.API_URL || 'https://YOUR_API_ID.execute-api.eu-central-1.amazonaws.com/prod';

// CORS headers
const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': SITE_URL,
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const path = event.path || event.rawPath;
  const method = event.httpMethod || event.requestContext?.http?.method;

  try {
    // POST /subscribe - Add new subscriber
    if (path === '/subscribe' && method === 'POST') {
      return await handleSubscribe(event);
    }

    // GET /confirm - Confirm subscription (double opt-in)
    if (path === '/confirm' && method === 'GET') {
      return await handleConfirm(event);
    }

    // GET /unsubscribe - Remove subscriber
    if (path === '/unsubscribe' && method === 'GET') {
      return await handleUnsubscribe(event);
    }

    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ error: 'Not found' }),
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};

// ============================================
// SUBSCRIBE - Add new subscriber with double opt-in
// ============================================
async function handleSubscribe(event) {
  const body = JSON.parse(event.body || '{}');
  const { email, name } = body;

  // Validate email
  if (!email || !isValidEmail(email)) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Podaj prawidłowy adres email' }),
    };
  }

  const normalizedEmail = email.toLowerCase().trim();
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date().toISOString();

  // Check if already subscribed
  const existing = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { email: normalizedEmail },
  }));

  if (existing.Item?.confirmed) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'Ten email jest już zapisany na newsletter' }),
    };
  }

  // Save to DynamoDB (unconfirmed)
  await docClient.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      email: normalizedEmail,
      name: name || '',
      token,
      confirmed: false,
      createdAt: now,
      updatedAt: now,
    },
  }));

  // Send confirmation email - link goes to API Gateway which redirects to website
  const confirmUrl = `${API_URL}/confirm?token=${token}&email=${encodeURIComponent(normalizedEmail)}`;
  
  await sesClient.send(new SendEmailCommand({
    Source: FROM_EMAIL,
    Destination: { ToAddresses: [normalizedEmail] },
    Message: {
      Subject: { Data: 'Potwierdź zapis na newsletter 1copywriting.pl' },
      Body: {
        Html: {
          Data: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a1a1a; }
    .container { max-width: 560px; margin: 0 auto; padding: 40px 20px; }
    .logo { font-size: 24px; font-weight: bold; color: #C03E2E; margin-bottom: 32px; }
    .logo span { color: #1a1a1a; }
    h1 { font-size: 24px; margin-bottom: 16px; }
    p { margin-bottom: 16px; color: #4a4a4a; }
    .btn { display: inline-block; background: #C03E2E; color: white !important; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 24px 0; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e5e5; font-size: 13px; color: #888; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo"><span style="color:#C03E2E">1</span>copywriting.pl</div>
    <h1>Potwierdź swój zapis</h1>
    <p>Cześć${name ? ` ${name}` : ''}!</p>
    <p>Dziękujemy za zapis na newsletter <strong>1copywriting.pl</strong>. Kliknij przycisk poniżej, aby potwierdzić subskrypcję:</p>
    <a href="${confirmUrl}" class="btn">Potwierdzam zapis</a>
    <p>Jeśli nie zapisywałeś/aś się na newsletter, zignoruj tę wiadomość.</p>
    <div class="footer">
      <p>1copywriting.pl — Kompletny przewodnik po copywritingu</p>
    </div>
  </div>
</body>
</html>
          `,
        },
        Text: {
          Data: `Potwierdź zapis na newsletter 1copywriting.pl\n\nKliknij link, aby potwierdzić: ${confirmUrl}\n\nJeśli nie zapisywałeś/aś się, zignoruj tę wiadomość.`,
        },
      },
    },
  }));

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ 
      message: 'Sprawdź swoją skrzynkę email i potwierdź zapis',
      success: true,
    }),
  };
}

// ============================================
// CONFIRM - Double opt-in confirmation
// ============================================
async function handleConfirm(event) {
  const params = event.queryStringParameters || {};
  const { token, email } = params;

  if (!token || !email) {
    return redirect('/newsletter/blad/');
  }

  const normalizedEmail = decodeURIComponent(email).toLowerCase();

  // Get subscriber
  const result = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { email: normalizedEmail },
  }));

  if (!result.Item) {
    return redirect('/newsletter/blad/');
  }

  if (result.Item.token !== token) {
    return redirect('/newsletter/blad/');
  }

  if (result.Item.confirmed) {
    return redirect('/newsletter/potwierdzono/');
  }

  // Confirm subscription
  await docClient.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      ...result.Item,
      confirmed: true,
      confirmedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  }));

  return redirect('/newsletter/potwierdzono/');
}

// ============================================
// UNSUBSCRIBE - Remove from list
// ============================================
async function handleUnsubscribe(event) {
  const params = event.queryStringParameters || {};
  const { token, email } = params;

  if (!token || !email) {
    return redirect('/newsletter/blad/');
  }

  const normalizedEmail = decodeURIComponent(email).toLowerCase();

  // Verify token
  const result = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { email: normalizedEmail },
  }));

  if (!result.Item || result.Item.token !== token) {
    return redirect('/newsletter/blad/');
  }

  // Delete subscriber
  await docClient.send(new DeleteCommand({
    TableName: TABLE_NAME,
    Key: { email: normalizedEmail },
  }));

  return redirect('/newsletter/wypisano/');
}

// ============================================
// Helpers
// ============================================
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function redirect(path) {
  return {
    statusCode: 302,
    headers: {
      ...headers,
      Location: `${SITE_URL}${path}`,
    },
    body: '',
  };
}
